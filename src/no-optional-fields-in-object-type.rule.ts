import { Decorator } from '@typescript-eslint/types/dist/generated/ast-spec'
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils'

const createRule = ESLintUtils.RuleCreator((name) => name)

const OBJECT_TYPE_DECORATOR = 'ObjectType'

type Options = []
type MessageIds = 'optionalField'

const decoratorHasName = (decorator: Decorator, name: string) => {
  const { expression } = decorator

  if (expression.type === AST_NODE_TYPES.Identifier) {
    return expression.name === name
  }

  if (
    expression.type === AST_NODE_TYPES.CallExpression &&
    expression.callee.type === AST_NODE_TYPES.Identifier
  ) {
    return expression.callee.name === name
  }

  return false
}

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
      const isObjectType = node.decorators?.some((decorator) =>
        decoratorHasName(decorator, OBJECT_TYPE_DECORATOR),
      )

      if (!isObjectType) {
        return
      }

      for (const member of node.body.body) {
        if (member.type !== AST_NODE_TYPES.PropertyDefinition) {
          continue
        }

        if (!member.optional) {
          continue
        }

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
