import { AST_NODE_TYPES } from '@typescript-eslint/utils'

import { createRule, findDecoratorByName } from './util'

type Options = []
type MessageIds = 'optionalField'

export const rule = createRule<Options, MessageIds>({
  name: 'no-optional-fields-in-object-type',
  meta: {
    messages: {
      optionalField:
        'Optional properties are not allowed on @ObjectType classes. Use `| null` instead of `?` for "{{propertyName}}".',
    },
    schema: [],
    docs: {
      description:
        'Disallow optional (?) properties on @ObjectType classes — use `| null` instead to force explicit assignment.',
    },
    type: 'problem',
  },
  defaultOptions: [],
  create: (context) => ({
    ClassDeclaration(node) {
      if (!findDecoratorByName(node.decorators, 'ObjectType')) return

      for (const member of node.body.body) {
        if (member.type !== AST_NODE_TYPES.PropertyDefinition) continue
        if (!member.optional) continue

        const propertyName =
          member.key.type === AST_NODE_TYPES.Identifier
            ? member.key.name
            : 'property'

        context.report({
          node: member.key,
          messageId: 'optionalField',
          data: { propertyName },
        })
      }
    },
  }),
})
