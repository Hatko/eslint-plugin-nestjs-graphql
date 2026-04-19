import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils'

import {
  createRule,
  decoratorTypeMatchesTsType,
  getDecoratorName,
  getTypedServices,
  NULLABLE_NONE,
  type NullableSpec,
  readNullableSpec,
  readTsType,
  type TypedServices,
} from './util'

const RESOLVER_METHOD_DECORATORS = new Set([
  'ResolveField',
  'Query',
  'Mutation',
])

const unwrapPromise = (typeNode: TSESTree.TypeNode) => {
  if (
    typeNode.type === AST_NODE_TYPES.TSTypeReference &&
    typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
    typeNode.typeName.name === 'Promise' &&
    typeNode.typeArguments
  ) {
    return typeNode.typeArguments.params[0]
  }
  return undefined
}

type MessageIds =
  | 'typeMismatch'
  | 'typeMismatchArrayIsExpected'
  | 'unexpectedListNullable'
  | 'unexpectedItemsNullable'

export const rule = createRule({
  name: 'matching-return-type',
  defaultOptions: [],
  meta: {
    messages: {
      typeMismatch: 'Type mismatch',
      typeMismatchArrayIsExpected: 'Type mismatch - array is expected',
      unexpectedListNullable:
        'Return type is nullable, but the decorator is missing `nullable: true` (or `nullable: \'itemsAndList\'`).',
      unexpectedItemsNullable:
        'Array element type is nullable, but the decorator is missing `nullable: \'items\'` (or `nullable: \'itemsAndList\'`).',
    },
    schema: [],
    docs: {
      description: '',
    },
    type: 'problem',
  },
  create: (context) => {
    const services = getTypedServices(context)
    return {
      'MethodDefinition[decorators.length>=1]:exit'(
        node: TSESTree.MethodDefinition,
      ) {
        processNode(node, context, services)
      },
    }
  },
})

const processNode = (
  node: TSESTree.MethodDefinition,
  context: Readonly<TSESLint.RuleContext<MessageIds, never[]>>,
  services: TypedServices | null,
) => {
  if (node.value.type !== AST_NODE_TYPES.FunctionExpression) return
  if (!node.value.returnType) return

  const parsed = parseDecorators(node)
  if (!parsed) return

  const { decoratorNullable, isDecoratedArray, typeFromDecorator } = parsed

  const innerReturnType =
    unwrapPromise(node.value.returnType.typeAnnotation) ??
    node.value.returnType.typeAnnotation

  const tsType = readTsType(innerReturnType, false)
  if (!tsType) return

  // Array-ness mismatch
  if (isDecoratedArray && !tsType.isArray) {
    context.report({ node, messageId: 'typeMismatchArrayIsExpected' })
    return
  }
  if (!isDecoratedArray && tsType.isArray) {
    context.report({ node, messageId: 'typeMismatch' })
    return
  }

  // Base type mismatch
  if (!decoratorTypeMatchesTsType(typeFromDecorator, tsType, services)) {
    context.report({ node, messageId: 'typeMismatch' })
    return
  }

  // Nullable: only report TS-nullable-but-decorator-isn't (preserve original semantic)
  if (tsType.listNullable && !decoratorNullable.list) {
    context.report({ node, messageId: 'unexpectedListNullable' })
  }
  if (
    isDecoratedArray &&
    tsType.itemsNullable &&
    !decoratorNullable.items
  ) {
    context.report({ node, messageId: 'unexpectedItemsNullable' })
  }
}

type ParsedDecorator = {
  decoratorNullable: NullableSpec
  isDecoratedArray: boolean
  typeFromDecorator: string
}

const parseDecorators = (
  node: TSESTree.MethodDefinition,
): ParsedDecorator | undefined => {
  const filteredDecorators = node.decorators.filter((decorator) => {
    const name = getDecoratorName(decorator)
    return name !== undefined && RESOLVER_METHOD_DECORATORS.has(name)
  })

  const expression = filteredDecorators[0]?.expression
  if (!expression || expression.type !== AST_NODE_TYPES.CallExpression) {
    return undefined
  }
  const args = expression.arguments
  if (args.length === 0) return undefined

  const [typeArgument, parametersArgument] = (() => {
    // @ResolveField supports a name as first parameter — skip it if present
    if (args[0]?.type === AST_NODE_TYPES.Literal) {
      return [args[1], args[2]]
    }
    return args
  })()

  const decoratorNullable = parametersArgument
    ? readNullableSpec(parametersArgument)
    : NULLABLE_NONE

  if (
    !typeArgument ||
    typeArgument.type !== AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    return undefined
  }
  if (
    typeArgument.body.type !== AST_NODE_TYPES.Identifier &&
    typeArgument.body.type !== AST_NODE_TYPES.ArrayExpression
  ) {
    return undefined
  }

  const typeFromDecorator = (() => {
    if (typeArgument.body.type === AST_NODE_TYPES.ArrayExpression) {
      const first = typeArgument.body.elements[0]
      return first?.type === AST_NODE_TYPES.Identifier ? first.name : undefined
    }
    return typeArgument.body.name
  })()

  if (typeFromDecorator === undefined) return undefined

  return {
    decoratorNullable,
    isDecoratedArray: typeArgument.body.type === AST_NODE_TYPES.ArrayExpression,
    typeFromDecorator,
  }
}
