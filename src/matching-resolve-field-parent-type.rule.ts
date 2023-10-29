import { ESLintUtils } from '@typescript-eslint/utils'
import { TSESTree } from '@typescript-eslint/types/dist'
import { RuleContext } from '@typescript-eslint/utils/dist/ts-eslint'

const createRule = ESLintUtils.RuleCreator((name) => name)

export const rule = createRule({
  name: 'decorator-return-type',
  defaultOptions: [],
  meta: {
    messages: {
      typeMismatch: 'Type mismatch',
      notDecoratedResolver: 'Resolver decorator does not have a type argument',
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
      ) => processNode(node, context),
    }
  },
})

const processNode = (
  node: TSESTree.MethodDefinition,
  context: Readonly<
    RuleContext<'typeMismatch' | 'notDecoratedResolver', never[]>
  >,
) => {
  if (node.value.type !== 'FunctionExpression') {
    console.log('Unexpected value type - please contact the author of the rule')
    return
  }
  if (!node.value.returnType) {
    return
  }

  const filteredDecorators = node.decorators.filter((decorator) => {
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
    return callee.name === 'ResolveField'
  })

  if (!filteredDecorators.length) {
    return
  }

  const methodParam = node.value.params.find(
    ({ decorators }) =>
      !!decorators.find(
        ({ expression }) =>
          expression.type === 'CallExpression' &&
          expression.callee.type === 'Identifier' &&
          expression.callee.name === 'Parent',
      ),
  )

  if (!methodParam) {
    // Parent parameter is not used

    return
  }

  const parentTypeName = (() => {
    if (
      (methodParam.type !== 'Identifier' &&
        methodParam.type !== 'ObjectPattern') ||
      !methodParam.typeAnnotation ||
      methodParam.typeAnnotation.typeAnnotation.type !== 'TSTypeReference' ||
      methodParam.typeAnnotation.typeAnnotation.typeName.type !== 'Identifier'
    ) {
      throw new Error(
        'Unexpected decorator expression type - please contact the author of the rule',
      )
    }

    return methodParam.typeAnnotation.typeAnnotation.typeName.name
  })()

  if (node.parent.parent?.type !== 'ClassDeclaration') {
    throw new Error(
      'Unexpected decorator expression type - please contact the author of the rule',
    )
  }

  const expression = node.parent.parent.decorators
    .map(({ expression }) => expression)
    .find((expression): expression is TSESTree.CallExpression => {
      if (
        expression.type !== 'CallExpression' ||
        expression.callee.type !== 'Identifier'
      ) {
        return false
      }

      return expression.callee.name === 'Resolver'
    })

  const resolverTypeArgument = expression?.arguments[0]

  if (!resolverTypeArgument) {
    context.report({ node, messageId: 'notDecoratedResolver' })

    return
  }

  const name = (() => {
    if (resolverTypeArgument.type === 'Identifier') {
      return resolverTypeArgument.name
    }

    if (
      resolverTypeArgument.type === 'ArrowFunctionExpression' &&
      resolverTypeArgument.body.type === 'Identifier'
    ) {
      return resolverTypeArgument.body?.name
    }

    throw new Error(
      'Unexpected decorator expression type - please contact the author of the rule',
    )
  })()

  if (name === parentTypeName) {
    return
  }

  context.report({ node, messageId: 'typeMismatch' })
}
