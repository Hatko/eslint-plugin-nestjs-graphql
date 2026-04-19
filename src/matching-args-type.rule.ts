import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils'

import {
  createRule,
  decoratorTypeMatchesTsType,
  findOptionsObject,
  getDecoratorName,
  getTypedServices,
  readNullableSpec,
  readTsType,
  TS_KEYWORD_DISPLAY,
} from './util'

type Options = []
type MessageIds =
  | 'typeMismatch'
  | 'arrayExpected'
  | 'arrayNotExpected'
  | 'listNullableOptionWithoutListNullableType'
  | 'listNullableTypeWithoutOption'
  | 'itemsNullableOptionWithoutItemsNullableType'
  | 'itemsNullableTypeWithoutOption'

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
      listNullableOptionWithoutListNullableType:
        '@Args has nullable at the list level, but the parameter type is not nullable. Add "| null" (or "?") to the parameter type.',
      listNullableTypeWithoutOption:
        'Parameter type is nullable, but @Args is missing nullable at the list level.',
      itemsNullableOptionWithoutItemsNullableType:
        '@Args declares items as nullable, but the array element type is not nullable. Use `(T | null)[]`.',
      itemsNullableTypeWithoutOption:
        'Array element type is nullable, but @Args does not declare items as nullable. Use `nullable: \'items\'` or `nullable: \'itemsAndList\'`.',
    },
    schema: [],
    docs: {
      description:
        'Enforce that @Args decorator options (type, nullable) match the TypeScript parameter type.',
    },
    type: 'problem',
  },
  create: (context) => {
    const services = getTypedServices(context)
    return {
      'MethodDefinition > FunctionExpression'(
        node: TSESTree.FunctionExpression,
      ) {
        for (const param of node.params) {
          if (param.type !== AST_NODE_TYPES.Identifier) continue

          const argsDecorator = param.decorators?.find(
            (decorator) => getDecoratorName(decorator) === 'Args',
          )
          if (!argsDecorator) continue

          const options = findOptionsObject(argsDecorator)
          if (!options) continue

          const decoratorType = extractDecoratorType(options)
          const nullableSpec = readNullableSpec(options)
          const hasAnyNullableOption = nullableSpec.list || nullableSpec.items

          if (!decoratorType && !hasAnyNullableOption) continue

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
            } else if (
              !decoratorTypeMatchesTsType(decoratorType.name, tsType, services)
            ) {
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

          if (nullableSpec.list && !tsType.listNullable) {
            context.report({
              node: param,
              messageId: 'listNullableOptionWithoutListNullableType',
            })
          } else if (
            !nullableSpec.list &&
            tsType.listNullable &&
            decoratorType
          ) {
            context.report({
              node: param,
              messageId: 'listNullableTypeWithoutOption',
            })
          }

          const arrayContext =
            (decoratorType?.isArray ?? false) || tsType.isArray
          if (arrayContext) {
            if (nullableSpec.items && !tsType.itemsNullable) {
              context.report({
                node: param,
                messageId: 'itemsNullableOptionWithoutItemsNullableType',
              })
            } else if (
              !nullableSpec.items &&
              tsType.itemsNullable &&
              decoratorType
            ) {
              context.report({
                node: param,
                messageId: 'itemsNullableTypeWithoutOption',
              })
            }
          }
        }
      },
    }
  },
})
