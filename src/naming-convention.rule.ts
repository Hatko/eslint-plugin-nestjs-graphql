import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils'

import { createRule, getDecoratorName } from './util'

const DEFAULT_SCALARS: ReadonlySet<string> = new Set([
  'String',
  'Boolean',
  'Number',
  'Float',
  'Int',
  'ID',
  'GraphQLISODateTime',
  'Date',
  'DateTime',
  'Timestamp',
  'JSON',
  'JSONObject',
  'Upload',
])

const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/
const PASCAL_CASE = /^[A-Z][a-zA-Z0-9]*$/

type Options = []
type MessageIds =
  | 'queryMutationCamelCase'
  | 'resolveFieldPascalCase'
  | 'resolveFieldCamelCase'
  | 'resolverClassName'

const extractTypeIdentifier = (
  typeArg: TSESTree.CallExpressionArgument | undefined,
): string | undefined => {
  if (!typeArg || typeArg.type !== AST_NODE_TYPES.ArrowFunctionExpression) {
    return undefined
  }
  const { body } = typeArg
  if (body.type === AST_NODE_TYPES.Identifier) return body.name
  if (body.type === AST_NODE_TYPES.ArrayExpression) {
    const [first] = body.elements
    if (first?.type === AST_NODE_TYPES.Identifier) return first.name
  }
  return undefined
}

const getResolveFieldType = (
  decorator: TSESTree.Decorator,
): string | undefined => {
  if (decorator.expression.type !== AST_NODE_TYPES.CallExpression) return
  const args = decorator.expression.arguments
  const typeArg =
    args[0]?.type === AST_NODE_TYPES.Literal ? args[1] : args[0]
  return extractTypeIdentifier(typeArg)
}

const getResolverParentType = (
  decorator: TSESTree.Decorator,
): string | undefined => {
  if (decorator.expression.type !== AST_NODE_TYPES.CallExpression) return
  const [first] = decorator.expression.arguments
  if (!first) return undefined
  if (first.type === AST_NODE_TYPES.Identifier) return first.name
  if (
    first.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    first.body.type === AST_NODE_TYPES.Identifier
  ) {
    return first.body.name
  }
  return undefined
}

const readMethodName = (key: TSESTree.Node): string | undefined => {
  if (key.type === AST_NODE_TYPES.Identifier) return key.name
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value
  }
  return undefined
}

export const rule = createRule<Options, MessageIds>({
  name: 'naming-convention',
  defaultOptions: [],
  meta: {
    messages: {
      queryMutationCamelCase:
        '@{{decorator}} method "{{name}}" must be camelCase.',
      resolveFieldPascalCase:
        '@ResolveField method "{{name}}" resolves a model ({{model}}) and must be PascalCase.',
      resolveFieldCamelCase:
        '@ResolveField method "{{name}}" resolves a scalar and must be camelCase.',
      resolverClassName:
        '@Resolver(() => {{model}}) class must be named "{{expected}}" (got "{{actual}}").',
    },
    schema: [],
    docs: {
      description:
        'Enforce naming conventions: @Query/@Mutation methods camelCase, @ResolveField methods PascalCase when resolving a model (camelCase for scalars), and @Resolver(() => Foo) classes named FooResolver.',
    },
    type: 'problem',
  },
  create: (context) => ({
    ClassDeclaration(node) {
      const resolverDecorator = node.decorators.find(
        (decorator) => getDecoratorName(decorator) === 'Resolver',
      )
      if (!resolverDecorator || !node.id) return

      const model = getResolverParentType(resolverDecorator)
      if (!model) return

      const expected = `${model}Resolver`
      if (node.id.name !== expected) {
        context.report({
          node: node.id,
          messageId: 'resolverClassName',
          data: { model, expected, actual: node.id.name },
        })
      }
    },
    'MethodDefinition[decorators.length>=1]'(
      node: TSESTree.MethodDefinition,
    ) {
      const name = readMethodName(node.key)
      if (!name) return

      for (const decorator of node.decorators) {
        const decoratorName = getDecoratorName(decorator)

        if (decoratorName === 'Query' || decoratorName === 'Mutation') {
          if (!CAMEL_CASE.test(name)) {
            context.report({
              node: node.key,
              messageId: 'queryMutationCamelCase',
              data: { decorator: decoratorName, name },
            })
          }
          return
        }

        if (decoratorName === 'ResolveField') {
          const type = getResolveFieldType(decorator)
          if (!type) return

          if (DEFAULT_SCALARS.has(type)) {
            if (!CAMEL_CASE.test(name)) {
              context.report({
                node: node.key,
                messageId: 'resolveFieldCamelCase',
                data: { name },
              })
            }
          } else if (!PASCAL_CASE.test(name)) {
            context.report({
              node: node.key,
              messageId: 'resolveFieldPascalCase',
              data: { name, model: type },
            })
          }
          return
        }
      }
    },
  }),
})
