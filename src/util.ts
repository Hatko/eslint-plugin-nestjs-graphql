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

export type NullableSpec = {
  list: boolean
  items: boolean
}

export const NULLABLE_NONE: NullableSpec = { list: false, items: false }

export const readNullableSpec = (
  optionsArg: TSESTree.CallExpressionArgument | undefined,
): NullableSpec => {
  if (!optionsArg || optionsArg.type !== AST_NODE_TYPES.ObjectExpression) {
    return NULLABLE_NONE
  }

  const prop = optionsArg.properties.find(
    (p): p is TSESTree.Property =>
      p.type === AST_NODE_TYPES.Property &&
      p.key.type === AST_NODE_TYPES.Identifier &&
      p.key.name === 'nullable',
  )

  if (!prop || prop.value.type !== AST_NODE_TYPES.Literal) return NULLABLE_NONE

  const value = prop.value.value
  if (value === true) return { list: true, items: false }
  if (value === 'items') return { list: false, items: true }
  if (value === 'itemsAndList') return { list: true, items: true }
  return NULLABLE_NONE
}

export const findOptionsObject = (
  decorator: TSESTree.Decorator,
): TSESTree.ObjectExpression | undefined => {
  if (decorator.expression.type !== AST_NODE_TYPES.CallExpression) {
    return undefined
  }
  return decorator.expression.arguments.find(
    (arg): arg is TSESTree.ObjectExpression =>
      arg.type === AST_NODE_TYPES.ObjectExpression,
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

export type TsType = {
  name: string
  isArray: boolean
  listNullable: boolean
  itemsNullable: boolean
}

const stripNullish = (typeNode: TSESTree.TypeNode) => {
  if (typeNode.type !== AST_NODE_TYPES.TSUnionType) {
    return { inner: typeNode, nullish: false }
  }
  let nullish = false
  const kept: TSESTree.TypeNode[] = []
  for (const member of typeNode.types) {
    if (
      member.type === AST_NODE_TYPES.TSNullKeyword ||
      member.type === AST_NODE_TYPES.TSUndefinedKeyword
    ) {
      nullish = true
      continue
    }
    kept.push(member)
  }
  const [first, ...rest] = kept
  if (!first || rest.length > 0) {
    return { inner: typeNode, nullish }
  }
  return { inner: first, nullish }
}

const baseName = (typeNode: TSESTree.TypeNode): string => {
  if (
    typeNode.type === AST_NODE_TYPES.TSTypeReference &&
    typeNode.typeName.type === AST_NODE_TYPES.Identifier
  ) {
    return typeNode.typeName.name
  }
  return typeNode.type
}

export const readTsType = (
  typeNode: TSESTree.TypeNode | undefined,
  topLevelOptional: boolean,
): TsType | undefined => {
  if (!typeNode) return undefined

  const { inner, nullish } = stripNullish(typeNode)
  const listNullable = nullish || topLevelOptional

  if (inner.type === AST_NODE_TYPES.TSArrayType) {
    const { inner: itemInner, nullish: itemsNullable } = stripNullish(
      inner.elementType,
    )
    return {
      name: baseName(itemInner),
      isArray: true,
      listNullable,
      itemsNullable,
    }
  }

  if (
    inner.type === AST_NODE_TYPES.TSTypeReference &&
    inner.typeName.type === AST_NODE_TYPES.Identifier &&
    inner.typeName.name === 'Array' &&
    inner.typeArguments
  ) {
    const element = inner.typeArguments.params[0]
    if (element) {
      const { inner: itemInner, nullish: itemsNullable } = stripNullish(element)
      return {
        name: baseName(itemInner),
        isArray: true,
        listNullable,
        itemsNullable,
      }
    }
  }

  if (
    inner.type === AST_NODE_TYPES.TSTypeOperator &&
    inner.operator === 'readonly'
  ) {
    return readTsType(inner.typeAnnotation, topLevelOptional)
  }

  return {
    name: baseName(inner),
    isArray: false,
    listNullable,
    itemsNullable: false,
  }
}
