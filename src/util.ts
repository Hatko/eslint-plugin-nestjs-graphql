import { AST_NODE_TYPES, ESLintUtils, TSESTree } from '@typescript-eslint/utils'

export const createRule = ESLintUtils.RuleCreator((name) => name)

export const getDecoratorName = (
  decorator: TSESTree.Decorator,
): string | undefined => {
  const { expression } = decorator

  if (expression.type === AST_NODE_TYPES.Identifier) {
    return expression.name
  }

  if (
    expression.type === AST_NODE_TYPES.CallExpression &&
    expression.callee.type === AST_NODE_TYPES.Identifier
  ) {
    return expression.callee.name
  }

  return undefined
}

export const findDecoratorByName = (
  decorators: readonly TSESTree.Decorator[] | undefined,
  name: string | ReadonlySet<string>,
): TSESTree.Decorator | undefined => {
  if (!decorators) return undefined

  const match =
    typeof name === 'string'
      ? (value: string | undefined) => value === name
      : (value: string | undefined) => value !== undefined && name.has(value)

  return decorators.find((decorator) => match(getDecoratorName(decorator)))
}

export const isNullableOption = (
  optionsArg: TSESTree.CallExpressionArgument | undefined,
): boolean => {
  if (!optionsArg || optionsArg.type !== AST_NODE_TYPES.ObjectExpression) {
    return false
  }

  return optionsArg.properties.some(
    (prop) =>
      prop.type === AST_NODE_TYPES.Property &&
      prop.key.type === AST_NODE_TYPES.Identifier &&
      prop.key.name === 'nullable' &&
      prop.value.type === AST_NODE_TYPES.Literal &&
      prop.value.value === true,
  )
}

export const GRAPHQL_SCALAR_TO_TS_KEYWORD: Record<string, readonly string[]> = {
  String: ['TSStringKeyword'],
  Boolean: ['TSBooleanKeyword'],
  Int: ['TSNumberKeyword'],
  Float: ['TSNumberKeyword'],
  Number: ['TSNumberKeyword'],
  ID: ['TSStringKeyword', 'TSNumberKeyword'],
}

export const TS_KEYWORD_TO_GRAPHQL_SCALARS: Record<string, readonly string[]> =
  Object.entries(GRAPHQL_SCALAR_TO_TS_KEYWORD).reduce<Record<string, string[]>>(
    (acc, [scalar, keywords]) => {
      for (const keyword of keywords) {
        acc[keyword] ??= []
        acc[keyword].push(scalar)
      }
      return acc
    },
    {},
  )

export const TS_KEYWORD_DISPLAY: Record<string, string> = {
  TSStringKeyword: 'string',
  TSNumberKeyword: 'number',
  TSBooleanKeyword: 'boolean',
}
