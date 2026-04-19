import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils'

import {
  createRule,
  getDecoratorName,
  isNullableOption,
  TS_KEYWORD_TO_GRAPHQL_SCALARS,
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

type TypeReferenceIdentifier = Omit<TSESTree.TSTypeReference, 'typeName'> & {
  typeName: TSESTree.Identifier
}

const isTypeReferenceIdentifier = (
  typeNode: TSESTree.TypeNode,
): typeNode is TypeReferenceIdentifier =>
  typeNode.type === AST_NODE_TYPES.TSTypeReference &&
  typeNode.typeName.type === AST_NODE_TYPES.Identifier

const nameFromTypeReferenceIdentifier = (typeNode: TSESTree.TypeNode) =>
  isTypeReferenceIdentifier(typeNode) ? typeNode.typeName.name : undefined

type MessageIds =
  | 'typeMismatch'
  | 'typeMismatchArrayIsExpected'
  | 'unexpectedNullable'

export const rule = createRule({
  name: 'matching-return-type',
  defaultOptions: [],
  meta: {
    messages: {
      typeMismatch: 'Type mismatch',
      typeMismatchArrayIsExpected: 'Type mismatch - array is expected',
      unexpectedNullable: 'Nullable return, but not decorated nullable',
    },
    schema: [],
    docs: {
      description: '',
    },
    type: 'problem',
  },
  create: (context) => ({
    'MethodDefinition[decorators.length>=1]:exit'(
      node: TSESTree.MethodDefinition,
    ) {
      processNode(node, context)
    },
  }),
})

const processNode = (
  node: TSESTree.MethodDefinition,
  context: Readonly<TSESLint.RuleContext<MessageIds, never[]>>,
) => {
  if (node.value.type !== AST_NODE_TYPES.FunctionExpression) return
  if (!node.value.returnType) return

  const parsedDecoratorInfo = parseDecorators(node)
  if (!parsedDecoratorInfo) return

  const { isDecoratedNullable, isDecoratedArray, typeFromDecorator } =
    parsedDecoratorInfo

  const unwrapUnion = (topReturnType: TSESTree.TSUnionType) => {
    const types = topReturnType.types.map((typeWithinUnion) => {
      if (typeWithinUnion.type === AST_NODE_TYPES.TSArrayType) {
        if (!isDecoratedArray) {
          context.report({ node, messageId: 'typeMismatchArrayIsExpected' })
        }
        const { elementType } = typeWithinUnion
        return nameFromTypeReferenceIdentifier(elementType) || elementType.type
      }

      if (typeWithinUnion.type === AST_NODE_TYPES.TSTypeReference) {
        const unwrapped = unwrapPromise(typeWithinUnion) ?? typeWithinUnion
        return nameFromTypeReferenceIdentifier(unwrapped) ?? unwrapped.type
      }

      if (
        typeWithinUnion.type === AST_NODE_TYPES.TSTypeOperator &&
        typeWithinUnion.operator === 'keyof' &&
        typeWithinUnion.typeAnnotation?.type === AST_NODE_TYPES.TSTypeQuery &&
        typeWithinUnion.typeAnnotation.exprName.type ===
          AST_NODE_TYPES.Identifier
      ) {
        return typeWithinUnion.typeAnnotation.exprName.name
      }

      if (
        typeWithinUnion.type === AST_NODE_TYPES.TSTypeQuery &&
        typeWithinUnion.exprName.type === AST_NODE_TYPES.Identifier
      ) {
        return typeWithinUnion.exprName.name
      }

      return typeWithinUnion.type
    })

    if (
      types.find(
        (t) =>
          t === AST_NODE_TYPES.TSNullKeyword ||
          t === AST_NODE_TYPES.TSUndefinedKeyword,
      ) &&
      !isDecoratedNullable
    ) {
      context.report({ node, messageId: 'unexpectedNullable' })
    }

    return {
      type: types.filter(
        (t) =>
          t !== AST_NODE_TYPES.TSNullKeyword &&
          t !== AST_NODE_TYPES.TSUndefinedKeyword,
      )[0],
    }
  }

  const typeToCompare = (() => {
    const topReturnType =
      unwrapPromise(node.value.returnType.typeAnnotation) ??
      node.value.returnType.typeAnnotation

    if (isDecoratedArray) {
      if (
        isTypeReferenceIdentifier(topReturnType) &&
        topReturnType.typeName.name === 'Array' &&
        topReturnType.typeArguments?.params[0]?.type ===
          AST_NODE_TYPES.TSTypeQuery &&
        topReturnType.typeArguments.params[0].exprName.type ===
          AST_NODE_TYPES.Identifier
      ) {
        return topReturnType.typeArguments.params[0].exprName.name
      }

      if (topReturnType.type === AST_NODE_TYPES.TSArrayType) {
        const { elementType } = topReturnType
        return nameFromTypeReferenceIdentifier(elementType) || elementType.type
      }

      if (topReturnType.type === AST_NODE_TYPES.TSUnionType) {
        return unwrapUnion(topReturnType)?.type
      }

      // Type isn't found - return 'Array' to trigger error
      return 'Array'
    }

    const name = nameFromTypeReferenceIdentifier(topReturnType)
    if (name) return name

    if (topReturnType.type === AST_NODE_TYPES.TSUnionType) {
      return unwrapUnion(topReturnType)?.type
    }

    return topReturnType.type
  })()

  if (typeToCompare === typeFromDecorator) return

  if (typeof typeToCompare === 'string') {
    const matches = TS_KEYWORD_TO_GRAPHQL_SCALARS[typeToCompare]
    if (matches?.includes(typeFromDecorator)) return
  }

  context.report({ node, messageId: 'typeMismatch' })
}

const parseDecorators = (node: TSESTree.MethodDefinition) => {
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

  const isDecoratedNullable = isNullableOption(parametersArgument)

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
    isDecoratedNullable,
    isDecoratedArray: typeArgument.body.type === AST_NODE_TYPES.ArrayExpression,
    typeFromDecorator,
  }
}
