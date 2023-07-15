import { ESLintUtils } from '@typescript-eslint/utils'
import { TSESTree } from '@typescript-eslint/types/dist'
import { Decorator } from '@typescript-eslint/types/dist/generated/ast-spec'

const createRule = ESLintUtils.RuleCreator((name) => name)

const types = {
  TSStringKeyword: ['String'],
  TSBooleanKeyword: ['Boolean'],
  TSNumberKeyword: ['Int', 'Number', 'Float'],
}

const unwrapPromise = (typeNode: TSESTree.TypeNode) => {
  if (
    typeNode.type === 'TSTypeReference' &&
    typeNode.typeName.type === 'Identifier' &&
    typeNode.typeName.name === 'Promise' &&
    typeNode.typeParameters
  ) {
    return typeNode.typeParameters.params[0]
  }
}

type TypeReferenceIdentifier = Omit<TSESTree.TSTypeReference, 'typeName'> & {
  typeName: TSESTree.Identifier
}

const isTypeReferenceIdentifier = (
  typeNode: TSESTree.TypeNode,
): typeNode is TypeReferenceIdentifier =>
  typeNode.type === 'TSTypeReference' && typeNode.typeName.type === 'Identifier'

const nameFromTypeReferenceIdentifier = (typeNode: TSESTree.TypeNode) =>
  isTypeReferenceIdentifier(typeNode) ? typeNode.typeName.name : undefined

export const rule = createRule({
  name: 'decorator-return-type',
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
  create: (context) => {
    return {
      'MethodDefinition[decorators.length>=1]:exit': (
        node: TSESTree.MethodDefinition,
      ) => {
        if (node.value.type !== 'FunctionExpression') {
          console.log(
            'Unexpected value type - please contact the author of the rule',
          )

          return
        }

        if (!node.value.returnType) {
          // No return type case isn't supported

          return
        }

        const parsedDecoratorInfo = parseDecorators(node)

        if (!parsedDecoratorInfo) {
          return
        }

        const { isDecoratedNullable, isDecoratedArray, typeFromDecorator } =
          parsedDecoratorInfo

        const compareTypes = (returnType: string, decoratorType: string) => {
          if (returnType === decoratorType) {
            return
          }

          const foundTypes = types[returnType as keyof typeof types]

          if (foundTypes?.some((t) => t === decoratorType)) {
            return
          }

          context.report({ node, messageId: 'typeMismatch' })
        }

        const topReturnType =
          unwrapPromise(node.value.returnType.typeAnnotation) ??
          node.value.returnType.typeAnnotation

        if (isDecoratedArray) {
          //
          // 2 Array cases have to be processed separately because of a different type information structure
          if (
            isTypeReferenceIdentifier(topReturnType) &&
            topReturnType.typeName.name === 'Array'
          ) {
            if (
              topReturnType.typeParameters?.params[0].type !== 'TSTypeQuery' ||
              topReturnType.typeParameters?.params[0].exprName.type !==
                'Identifier'
            ) {
              throw new Error(
                'Unexpected array argument type - please contact the author of the rule',
              )
            }

            const returnType =
              topReturnType.typeParameters.params[0].exprName.name

            compareTypes(returnType, typeFromDecorator)

            return
          }

          if (topReturnType.type === 'TSArrayType') {
            const { elementType } = topReturnType

            const returnType =
              nameFromTypeReferenceIdentifier(elementType) || elementType.type

            compareTypes(returnType, typeFromDecorator)

            return
          }
          //

          context.report({ node, messageId: 'typeMismatchArrayIsExpected' })

          return
        }

        const name = nameFromTypeReferenceIdentifier(topReturnType)

        if (name) {
          compareTypes(name, typeFromDecorator)

          return
        }

        if (topReturnType.type === 'TSUnionType') {
          const types = topReturnType.types.map((typeWithinUnion) => {
            if (typeWithinUnion.type === 'TSTypeReference') {
              const unwrapped =
                unwrapPromise(typeWithinUnion) ?? typeWithinUnion

              const name = nameFromTypeReferenceIdentifier(unwrapped)

              if (!name) {
                throw new Error(
                  'Unexpected unwrapped Type - please contact the author of the rule',
                )
              }

              return name
            } else if (
              typeWithinUnion.type === 'TSTypeOperator' &&
              typeWithinUnion.operator === 'keyof'
            ) {
              if (
                typeWithinUnion.typeAnnotation?.type !== 'TSTypeQuery' ||
                typeWithinUnion.typeAnnotation?.exprName.type !== 'Identifier'
              ) {
                throw new Error(
                  'Unexpected typeAnnotation type - please contact the author of the rule',
                )
              }

              return typeWithinUnion.typeAnnotation?.exprName.name
            } else if (typeWithinUnion.type === 'TSTypeQuery') {
              if (typeWithinUnion.exprName.type !== 'Identifier') {
                throw new Error(
                  'Unexpected typeAnnotation type - please contact the author of the rule',
                )
              }

              return typeWithinUnion.exprName.name
            } else {
              return typeWithinUnion.type
            }
          })

          if (
            types.find(
              (t) => t === 'TSNullKeyword' || t === 'TSUndefinedKeyword',
            ) &&
            !isDecoratedNullable
          ) {
            context.report({
              node,
              messageId: 'unexpectedNullable',
            })
          }

          const returnType = types.filter(
            (t) => t !== 'TSNullKeyword' && t !== 'TSUndefinedKeyword',
          )[0]

          compareTypes(returnType, typeFromDecorator)

          return
        }

        compareTypes(topReturnType.type, typeFromDecorator)
      },
    }
  },
})

type TypedDecorator = Omit<Decorator, 'expression'> & {
  expression: Omit<TSESTree.CallExpression, 'callee'> & {
    callee: TSESTree.Identifier
  }
}

const checkDecoratedNullable = (
  parametersArgument: TSESTree.CallExpressionArgument,
) =>
  parametersArgument.type === 'ObjectExpression' &&
  parametersArgument.properties.some(
    (p) =>
      p.type === 'Property' &&
      p.key.type === 'Identifier' &&
      p.key.name === 'nullable' &&
      p.value.type === 'Literal' &&
      p.value.value,
  )

const parseDecorators = (node: TSESTree.MethodDefinition) => {
  const filteredDecorators = node.decorators.filter(
    (decorator): decorator is TypedDecorator => {
      const { expression } = decorator

      if (expression.type !== 'CallExpression') {
        console.log(
          'Unexpected decorator expression type - please contact the author of the rule',
        )
        return false
      }

      const { callee } = expression

      if (callee.type !== 'Identifier') {
        console.log(
          'Unexpected decorator expression type - please contact the author of the rule',
        )
        return false
      }

      return (
        callee.name === 'ResolveField' ||
        callee.name === 'Query' ||
        callee.name === 'Mutation'
      )
    },
  )

  const args = filteredDecorators[0]?.expression?.arguments

  if (!args) {
    return undefined
  }

  const [typeArgument, parametersArgument] = args

  const isDecoratedNullable =
    (parametersArgument && checkDecoratedNullable(parametersArgument)) || false

  if (
    typeArgument.type !== 'ArrowFunctionExpression' ||
    (typeArgument.body.type !== 'Identifier' &&
      typeArgument.body.type !== 'ArrayExpression')
  ) {
    throw new Error(
      'Unexpected first argument type - please contact the author of the rule',
    )
  }

  const typeFromDecorator = (() => {
    if (typeArgument.body.type === 'ArrayExpression') {
      if (typeArgument.body.elements[0]?.type === 'Identifier') {
        return typeArgument.body.elements[0]?.name
      } else {
        throw new Error(
          'Unexpected Array Element Type - please contact the author of the rule',
        )
      }
    }

    return typeArgument.body.name
  })()

  return {
    isDecoratedNullable,
    isDecoratedArray: typeArgument.body.type === 'ArrayExpression',
    typeFromDecorator,
  }
}
