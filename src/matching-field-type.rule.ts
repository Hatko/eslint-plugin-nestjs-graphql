import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils'

import {
  createRule,
  decoratorTypeMatchesTsType,
  findDecoratorByName,
  findOptionsObject,
  getDecoratorName,
  getTypedServices,
  readNullableSpec,
  readTsType,
  TS_KEYWORD_DISPLAY,
} from './util'

type Options = []
type MessageIds =
  | 'typeMismatch'
  | 'arrayExpected'
  | 'arrayNotExpected'
  | 'listNullableOptionWithoutListNullableType'
  | 'listNullableTypeWithoutOption'
  | 'itemsNullableOptionWithoutItemsNullableType'
  | 'itemsNullableTypeWithoutOption'

const FIELD_HOST_DECORATORS: ReadonlySet<string> = new Set([
  'ObjectType',
  'InputType',
  'ArgsType',
])

type DecoratorType = {
  name: string
  isArray: boolean
}

const extractFieldType = (
  decorator: TSESTree.Decorator,
): DecoratorType | undefined => {
  if (decorator.expression.type !== AST_NODE_TYPES.CallExpression) return
  const [first] = decorator.expression.arguments
  if (!first || first.type !== AST_NODE_TYPES.ArrowFunctionExpression) return

  const { body } = first
  if (body.type === AST_NODE_TYPES.Identifier) {
    return { name: body.name, isArray: false }
  }
  if (body.type === AST_NODE_TYPES.ArrayExpression) {
    const [inner] = body.elements
    if (inner?.type === AST_NODE_TYPES.Identifier) {
      return { name: inner.name, isArray: true }
    }
  }
  return undefined
}

const displayTsName = (name: string) => TS_KEYWORD_DISPLAY[name] ?? name

export const rule = createRule<Options, MessageIds>({
  name: 'matching-field-type',
  defaultOptions: [],
  meta: {
    messages: {
      typeMismatch:
        '@Field type "{{decoratorType}}" does not match property type "{{tsType}}".',
      arrayExpected:
        '@Field type is declared as an array ("[{{decoratorType}}]"), but the property is not an array.',
      arrayNotExpected:
        '@Field type is not an array, but the property is declared as an array.',
      listNullableOptionWithoutListNullableType:
        '@Field has nullable at the list level, but the property type is not nullable. Add "| null" to the property type.',
      listNullableTypeWithoutOption:
        'Property type is nullable, but @Field is missing nullable at the list level.',
      itemsNullableOptionWithoutItemsNullableType:
        '@Field declares items as nullable, but the array element type is not nullable. Use `(T | null)[]`.',
      itemsNullableTypeWithoutOption:
        "Array element type is nullable, but @Field does not declare items as nullable. Use `nullable: 'items'` or `nullable: 'itemsAndList'`.",
    },
    schema: [],
    docs: {
      description:
        'Enforce that @Field decorator options (type, nullable) match the TypeScript property type on @ObjectType, @InputType, and @ArgsType classes.',
    },
    type: 'problem',
  },
  create: (context) => {
    const services = getTypedServices(context)
    return {
      ClassDeclaration(node) {
        if (!findDecoratorByName(node.decorators, FIELD_HOST_DECORATORS)) return

        for (const member of node.body.body) {
          if (member.type !== AST_NODE_TYPES.PropertyDefinition) continue

          const fieldDecorator = member.decorators?.find(
            (decorator) => getDecoratorName(decorator) === 'Field',
          )
          if (!fieldDecorator) continue

          const decoratorType = extractFieldType(fieldDecorator)
          const options = findOptionsObject(fieldDecorator)
          const nullableSpec = readNullableSpec(options)
          const hasAnyNullableOption = nullableSpec.list || nullableSpec.items

          if (!decoratorType && !hasAnyNullableOption) continue

          const tsType = readTsType(
            member.typeAnnotation?.typeAnnotation,
            member.optional === true,
          )
          if (!tsType) continue

          const reportNode = member.key

          if (decoratorType) {
            if (decoratorType.isArray && !tsType.isArray) {
              context.report({
                node: reportNode,
                messageId: 'arrayExpected',
                data: { decoratorType: decoratorType.name },
              })
            } else if (!decoratorType.isArray && tsType.isArray) {
              context.report({
                node: reportNode,
                messageId: 'arrayNotExpected',
              })
            } else if (
              !decoratorTypeMatchesTsType(decoratorType.name, tsType, services)
            ) {
              const tsDisplay = displayTsName(tsType.name)
              context.report({
                node: reportNode,
                messageId: 'typeMismatch',
                data: {
                  decoratorType: decoratorType.isArray
                    ? `[${decoratorType.name}]`
                    : decoratorType.name,
                  tsType: tsType.isArray ? `${tsDisplay}[]` : tsDisplay,
                },
              })
            }
          }

          if (nullableSpec.list && !tsType.listNullable) {
            context.report({
              node: reportNode,
              messageId: 'listNullableOptionWithoutListNullableType',
            })
          } else if (
            !nullableSpec.list &&
            tsType.listNullable &&
            decoratorType
          ) {
            context.report({
              node: reportNode,
              messageId: 'listNullableTypeWithoutOption',
            })
          }

          const arrayContext =
            (decoratorType?.isArray ?? false) || tsType.isArray
          if (arrayContext) {
            if (nullableSpec.items && !tsType.itemsNullable) {
              context.report({
                node: reportNode,
                messageId: 'itemsNullableOptionWithoutItemsNullableType',
              })
            } else if (
              !nullableSpec.items &&
              tsType.itemsNullable &&
              decoratorType
            ) {
              context.report({
                node: reportNode,
                messageId: 'itemsNullableTypeWithoutOption',
              })
            }
          }
        }
      },
    }
  },
})
