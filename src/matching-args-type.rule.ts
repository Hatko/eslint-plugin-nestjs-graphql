import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils'

import {
  createRule,
  GRAPHQL_SCALAR_TO_TS_KEYWORD,
  getDecoratorName,
  isNullableOption,
  TS_KEYWORD_DISPLAY,
} from './util'

type Options = []
type MessageIds =
  | 'typeMismatch'
  | 'arrayExpected'
  | 'arrayNotExpected'
  | 'nullableOptionWithoutNullableType'
  | 'nullableTypeWithoutNullableOption'

const extractOptionsObject = (
  decorator: TSESTree.Decorator,
): TSESTree.ObjectExpression | undefined => {
  if (decorator.expression.type !== AST_NODE_TYPES.CallExpression) {
    return undefined
  }
  // @Args() | @Args('name') | @Args('name', options) | @Args(options)
  return decorator.expression.arguments.find(
    (arg): arg is TSESTree.ObjectExpression =>
      arg.type === AST_NODE_TYPES.ObjectExpression,
  )
}

type DecoratorType = {
  name: string
  isArray: boolean
}

const extractDecoratorType = (
  options: TSESTree.ObjectExpression,
): DecoratorType | undefined => {
  const prop = options.properties.find(
    (p): p is TSESTree.Property =>
      p.type === AST_NODE_TYPES.Property &&
      p.key.type === AST_NODE_TYPES.Identifier &&
      p.key.name === 'type',
  )
  if (!prop || prop.value.type !== AST_NODE_TYPES.ArrowFunctionExpression) {
    return undefined
  }

  const { body } = prop.value
  if (body.type === AST_NODE_TYPES.Identifier) {
    return { name: body.name, isArray: false }
  }
  if (body.type === AST_NODE_TYPES.ArrayExpression) {
    const [first] = body.elements
    if (first?.type === AST_NODE_TYPES.Identifier) {
      return { name: first.name, isArray: true }
    }
  }
  return undefined
}

type TsType = {
  name: string
  isArray: boolean
  isNullable: boolean
}

const unwrapNullable = (typeNode: TSESTree.TypeNode) => {
  if (typeNode.type !== AST_NODE_TYPES.TSUnionType) {
    return { inner: typeNode, isNullable: false }
  }
  let isNullable = false
  const kept: TSESTree.TypeNode[] = []
  for (const member of typeNode.types) {
    if (
      member.type === AST_NODE_TYPES.TSNullKeyword ||
      member.type === AST_NODE_TYPES.TSUndefinedKeyword
    ) {
      isNullable = true
      continue
    }
    kept.push(member)
  }
  const [first, ...rest] = kept
  if (!first || rest.length > 0) {
    return { inner: typeNode, isNullable }
  }
  return { inner: first, isNullable }
}

const readTsType = (
  typeNode: TSESTree.TypeNode | undefined,
  paramOptional: boolean,
): TsType | undefined => {
  if (!typeNode) return undefined

  const { inner, isNullable: unionNullable } = unwrapNullable(typeNode)
  const isNullable = unionNullable || paramOptional

  if (inner.type === AST_NODE_TYPES.TSArrayType) {
    const { elementType } = inner
    const elementName =
      elementType.type === AST_NODE_TYPES.TSTypeReference &&
      elementType.typeName.type === AST_NODE_TYPES.Identifier
        ? elementType.typeName.name
        : elementType.type
    return { name: elementName, isArray: true, isNullable }
  }

  if (
    inner.type === AST_NODE_TYPES.TSTypeReference &&
    inner.typeName.type === AST_NODE_TYPES.Identifier
  ) {
    if (inner.typeName.name === 'Array' && inner.typeArguments) {
      const [first] = inner.typeArguments.params
      if (
        first?.type === AST_NODE_TYPES.TSTypeReference &&
        first.typeName.type === AST_NODE_TYPES.Identifier
      ) {
        return { name: first.typeName.name, isArray: true, isNullable }
      }
    }
    return { name: inner.typeName.name, isArray: false, isNullable }
  }

  return { name: inner.type, isArray: false, isNullable }
}

const decoratorTypeMatchesTs = (decoratorName: string, tsName: string) => {
  if (decoratorName === tsName) return true
  const tsKeywords = GRAPHQL_SCALAR_TO_TS_KEYWORD[decoratorName]
  return tsKeywords?.includes(tsName) ?? false
}

const displayTsName = (name: string) => TS_KEYWORD_DISPLAY[name] ?? name

export const rule = createRule<Options, MessageIds>({
  name: 'matching-args-type',
  defaultOptions: [],
  meta: {
    messages: {
      typeMismatch:
        '@Args type "{{decoratorType}}" does not match parameter type "{{tsType}}".',
      arrayExpected:
        '@Args type is declared as an array ("[{{decoratorType}}]"), but the parameter is not an array.',
      arrayNotExpected:
        '@Args type is not an array, but the parameter is declared as an array.',
      nullableOptionWithoutNullableType:
        '@Args has { nullable: true }, but the parameter type is not nullable. Add "| null" (or "?") to the parameter type.',
      nullableTypeWithoutNullableOption:
        'Parameter type is nullable, but @Args is missing { nullable: true }.',
    },
    schema: [],
    docs: {
      description:
        'Enforce that @Args decorator options (type, nullable) match the TypeScript parameter type.',
    },
    type: 'problem',
  },
  create: (context) => ({
    'MethodDefinition > FunctionExpression'(node: TSESTree.FunctionExpression) {
      for (const param of node.params) {
        if (param.type !== AST_NODE_TYPES.Identifier) continue

        const argsDecorator = param.decorators?.find(
          (decorator) => getDecoratorName(decorator) === 'Args',
        )
        if (!argsDecorator) continue

        const options = extractOptionsObject(argsDecorator)
        if (!options) continue

        const decoratorType = extractDecoratorType(options)
        const decoratorNullable = isNullableOption(options)

        if (!decoratorType && !decoratorNullable) continue

        const tsType = readTsType(
          param.typeAnnotation?.typeAnnotation,
          param.optional === true,
        )
        if (!tsType) continue

        if (decoratorType) {
          if (decoratorType.isArray && !tsType.isArray) {
            context.report({
              node: param,
              messageId: 'arrayExpected',
              data: { decoratorType: decoratorType.name },
            })
          } else if (!decoratorType.isArray && tsType.isArray) {
            context.report({
              node: param,
              messageId: 'arrayNotExpected',
            })
          } else if (!decoratorTypeMatchesTs(decoratorType.name, tsType.name)) {
            const tsDisplay = displayTsName(tsType.name)
            context.report({
              node: param,
              messageId: 'typeMismatch',
              data: {
                decoratorType: decoratorType.isArray
                  ? `[${decoratorType.name}]`
                  : decoratorType.name,
                tsType: tsType.isArray ? `${tsDisplay}[]` : tsDisplay,
              },
            })
          }
        }

        if (decoratorNullable && !tsType.isNullable) {
          context.report({
            node: param,
            messageId: 'nullableOptionWithoutNullableType',
          })
        } else if (!decoratorNullable && tsType.isNullable && decoratorType) {
          context.report({
            node: param,
            messageId: 'nullableTypeWithoutNullableOption',
          })
        }
      }
    },
  }),
})
