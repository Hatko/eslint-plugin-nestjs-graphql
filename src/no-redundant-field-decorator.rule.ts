import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils'

import {
  createRule,
  findDecoratorByName,
  getDecoratorName,
  readTsType,
} from './util'

type Options = []
type MessageIds = 'redundantField'

const FIELD_HOST_DECORATORS: ReadonlySet<string> = new Set([
  'ObjectType',
  'InputType',
  'ArgsType',
])

// Options keys that do NOT justify an explicit @Field — removing the decorator
// doesn't lose anything the compiler plugin can't re-derive.
const TRIVIAL_OPTION_KEYS: ReadonlySet<string> = new Set([
  'nullable',
  'description',
])

// TS types the NestJS GraphQL compiler plugin infers without help.
const INFERRABLE_TS_TYPES: ReadonlySet<string> = new Set([
  'TSStringKeyword',
  'TSNumberKeyword',
  'TSBooleanKeyword',
])

const hasOnlyTrivialOptions = (
  options: TSESTree.ObjectExpression | undefined,
): boolean => {
  if (!options) return true
  return options.properties.every(
    (prop) =>
      prop.type === AST_NODE_TYPES.Property &&
      prop.key.type === AST_NODE_TYPES.Identifier &&
      TRIVIAL_OPTION_KEYS.has(prop.key.name),
  )
}

const hasExplicitTypeFunction = (
  decorator: TSESTree.Decorator,
): boolean => {
  if (decorator.expression.type !== AST_NODE_TYPES.CallExpression) return false
  for (const arg of decorator.expression.arguments) {
    if (arg.type === AST_NODE_TYPES.ArrowFunctionExpression) return true
    if (arg.type === AST_NODE_TYPES.ObjectExpression) {
      const hasType = arg.properties.some(
        (prop) =>
          prop.type === AST_NODE_TYPES.Property &&
          prop.key.type === AST_NODE_TYPES.Identifier &&
          prop.key.name === 'type',
      )
      if (hasType) return true
    }
  }
  return false
}

const asObjectExpression = (
  decorator: TSESTree.Decorator,
): TSESTree.ObjectExpression | undefined => {
  if (decorator.expression.type !== AST_NODE_TYPES.CallExpression) return
  return decorator.expression.arguments.find(
    (arg): arg is TSESTree.ObjectExpression =>
      arg.type === AST_NODE_TYPES.ObjectExpression,
  )
}

export const rule = createRule<Options, MessageIds>({
  name: 'no-redundant-field-decorator',
  defaultOptions: [],
  meta: {
    messages: {
      redundantField:
        '@Field is redundant here — the NestJS GraphQL compiler plugin infers the type from the TypeScript annotation. Remove the decorator.',
    },
    schema: [],
    fixable: 'code',
    docs: {
      description:
        'Disallow redundant @Field decorators on @ObjectType/@InputType/@ArgsType properties whose type is a primitive the compiler plugin auto-infers.',
    },
    type: 'suggestion',
  },
  create: (context) => ({
    ClassDeclaration(node) {
      if (!findDecoratorByName(node.decorators, FIELD_HOST_DECORATORS)) return

      for (const member of node.body.body) {
        if (member.type !== AST_NODE_TYPES.PropertyDefinition) continue

        const fieldDecorator = member.decorators?.find(
          (decorator) => getDecoratorName(decorator) === 'Field',
        )
        if (!fieldDecorator) continue

        if (hasExplicitTypeFunction(fieldDecorator)) continue

        const options = asObjectExpression(fieldDecorator)
        if (!hasOnlyTrivialOptions(options)) continue

        const tsType = readTsType(
          member.typeAnnotation?.typeAnnotation,
          member.optional === true,
        )
        if (!tsType || !INFERRABLE_TS_TYPES.has(tsType.name)) continue

        context.report({
          node: fieldDecorator,
          messageId: 'redundantField',
          fix: (fixer) => {
            const sourceCode = context.sourceCode
            const nextToken = sourceCode.getTokenAfter(fieldDecorator)
            const end = nextToken?.range[0] ?? fieldDecorator.range[1]
            return fixer.removeRange([fieldDecorator.range[0], end])
          },
        })
      }
    },
  }),
})
