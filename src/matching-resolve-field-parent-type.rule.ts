import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils'

import { createRule, getDecoratorName } from './util'

type MessageIds = 'typeMismatch' | 'notDecoratedResolver'

export const rule = createRule({
  name: 'matching-resolve-field-parent-type',
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

  const hasResolveField = node.decorators.some(
    (decorator) => getDecoratorName(decorator) === 'ResolveField',
  )
  if (!hasResolveField) return

  const methodParam = node.value.params.find(
    ({ decorators }) =>
      !!decorators.find(
        (decorator) => getDecoratorName(decorator) === 'Parent',
      ),
  )
  if (!methodParam) return

  if (
    (methodParam.type !== AST_NODE_TYPES.Identifier &&
      methodParam.type !== AST_NODE_TYPES.ObjectPattern) ||
    !methodParam.typeAnnotation ||
    methodParam.typeAnnotation.typeAnnotation.type !==
      AST_NODE_TYPES.TSTypeReference ||
    methodParam.typeAnnotation.typeAnnotation.typeName.type !==
      AST_NODE_TYPES.Identifier
  ) {
    return
  }
  const parentTypeName = methodParam.typeAnnotation.typeAnnotation.typeName.name

  if (node.parent.parent?.type !== AST_NODE_TYPES.ClassDeclaration) return

  const resolverCall = node.parent.parent.decorators
    .map(({ expression }) => expression)
    .find((expression): expression is TSESTree.CallExpression => {
      if (
        expression.type !== AST_NODE_TYPES.CallExpression ||
        expression.callee.type !== AST_NODE_TYPES.Identifier
      ) {
        return false
      }
      return expression.callee.name === 'Resolver'
    })

  const resolverTypeArgument = resolverCall?.arguments[0]

  if (!resolverTypeArgument) {
    context.report({ node, messageId: 'notDecoratedResolver' })
    return
  }

  const name = (() => {
    if (resolverTypeArgument.type === AST_NODE_TYPES.Identifier) {
      return resolverTypeArgument.name
    }
    if (
      resolverTypeArgument.type === AST_NODE_TYPES.ArrowFunctionExpression &&
      resolverTypeArgument.body.type === AST_NODE_TYPES.Identifier
    ) {
      return resolverTypeArgument.body.name
    }
    return undefined
  })()

  if (name === undefined || name === parentTypeName) return

  context.report({ node, messageId: 'typeMismatch' })
}
