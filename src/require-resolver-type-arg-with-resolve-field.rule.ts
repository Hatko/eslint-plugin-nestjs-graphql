import { AST_NODE_TYPES } from '@typescript-eslint/utils'

import { createRule, findDecoratorByName, getDecoratorName } from './util'

type Options = []
type MessageIds = 'missingTypeArg'

export const rule = createRule<Options, MessageIds>({
  name: 'require-resolver-type-arg-with-resolve-field',
  defaultOptions: [],
  meta: {
    messages: {
      missingTypeArg:
        '@Resolver() requires a parent type argument (e.g. @Resolver(() => User)) when the class contains @ResolveField methods.',
    },
    schema: [],
    docs: {
      description:
        'Require @Resolver() to declare a parent type when the class contains any @ResolveField method.',
    },
    type: 'problem',
  },
  create: (context) => ({
    ClassDeclaration(node) {
      const resolverDecorator = findDecoratorByName(node.decorators, 'Resolver')
      if (!resolverDecorator) return

      const hasResolveField = node.body.body.some(
        (member) =>
          member.type === AST_NODE_TYPES.MethodDefinition &&
          member.decorators?.some(
            (decorator) => getDecoratorName(decorator) === 'ResolveField',
          ),
      )
      if (!hasResolveField) return

      const { expression } = resolverDecorator
      if (
        expression.type !== AST_NODE_TYPES.CallExpression ||
        expression.arguments.length === 0
      ) {
        context.report({
          node: resolverDecorator,
          messageId: 'missingTypeArg',
        })
      }
    },
  }),
})
