import ts from 'typescript'

import { TSESTree } from '@typescript-eslint/types/dist'
import { Decorator } from '@typescript-eslint/types/dist/generated/ast-spec'
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils'
import { RuleContext } from '@typescript-eslint/utils/dist/ts-eslint'
import { ParserServices } from '@typescript-eslint/utils/dist/ts-estree'

const createRule = ESLintUtils.RuleCreator((name) => name)

const MODEL_DECORATORS = new Set(['ObjectType', 'InputType', 'InterfaceType'])
const FIELD_DECORATOR_NAME = 'Field'
const DEFAULT_SCALARS = new Set([
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

type Options = [
  {
    scalars?: string[]
  }?,
]

type MessageIds = 'nestedModelField'

type TypeInfo = {
  name: string
  node: TSESTree.Node
}

type FieldDecorator = Omit<Decorator, 'expression'> & {
  expression: Omit<TSESTree.CallExpression, 'callee'> & {
    callee: TSESTree.Identifier
  }
}

const decoratorHasName = (decorator: Decorator, names: Set<string>) => {
  const { expression } = decorator

  if (expression.type === AST_NODE_TYPES.Identifier) {
    return names.has(expression.name)
  }

  if (
    expression.type === AST_NODE_TYPES.CallExpression &&
    expression.callee.type === AST_NODE_TYPES.Identifier
  ) {
    return names.has(expression.callee.name)
  }

  return false
}

const isFieldDecorator = (decorator: Decorator): decorator is FieldDecorator =>
  decorator.expression.type === AST_NODE_TYPES.CallExpression &&
  decorator.expression.callee.type === AST_NODE_TYPES.Identifier &&
  decorator.expression.callee.name === FIELD_DECORATOR_NAME

const extractTypeInfosFromExpression = (
  expression: TSESTree.Node | null,
): TypeInfo[] => {
  if (!expression) {
    return []
  }

  if (expression.type === AST_NODE_TYPES.Identifier) {
    return [{ name: expression.name, node: expression }]
  }

  if (expression.type === AST_NODE_TYPES.ArrayExpression) {
    const [firstElement] = expression.elements

    if (!firstElement) {
      return []
    }

    if (firstElement.type === AST_NODE_TYPES.Identifier) {
      return [{ name: firstElement.name, node: firstElement }]
    }

    return extractTypeInfosFromExpression(firstElement)
  }

  if (expression.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    return extractTypeInfosFromExpression(expression.body)
  }

  if (expression.type === AST_NODE_TYPES.CallExpression) {
    const [firstArgument] = expression.arguments

    if (firstArgument) {
      return extractTypeInfosFromExpression(firstArgument)
    }
  }

  if (expression.type === AST_NODE_TYPES.TSAsExpression) {
    return extractTypeInfosFromExpression(expression.expression)
  }

  return []
}

const extractTypeInfosFromDecorator = (decorator: FieldDecorator) => {
  const [firstArgument] = decorator.expression.arguments

  if (!firstArgument) {
    return []
  }

  if (firstArgument.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    return extractTypeInfosFromExpression(firstArgument.body)
  }

  return extractTypeInfosFromExpression(firstArgument)
}

const extractTypeInfosFromTypeNode = (
  typeNode: TSESTree.TypeNode | undefined,
): TypeInfo[] => {
  if (!typeNode) {
    return []
  }

  if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
    if (
      typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
      (typeNode.typeName.name === 'Promise' || typeNode.typeName.name === 'Array')
    ) {
      const [firstArgument] = typeNode.typeArguments?.params ?? []

      if (firstArgument) {
        return extractTypeInfosFromTypeNode(firstArgument)
      }

      return []
    }

    if (typeNode.typeName.type === AST_NODE_TYPES.Identifier) {
      return [
        {
          name: typeNode.typeName.name,
          node: typeNode.typeName,
        },
      ]
    }

    return []
  }

  if (typeNode.type === AST_NODE_TYPES.TSArrayType) {
    return extractTypeInfosFromTypeNode(typeNode.elementType)
  }

  if (typeNode.type === AST_NODE_TYPES.TSUnionType) {
    return typeNode.types.flatMap((nestedType) => {
      if (
        nestedType.type === AST_NODE_TYPES.TSNullKeyword ||
        nestedType.type === AST_NODE_TYPES.TSUndefinedKeyword
      ) {
        return []
      }

      return extractTypeInfosFromTypeNode(nestedType)
    })
  }

  if (
    typeNode.type === AST_NODE_TYPES.TSTypeOperator &&
    typeNode.operator === 'readonly'
  ) {
    return extractTypeInfosFromTypeNode(typeNode.typeAnnotation)
  }

  return []
}

const canHaveDecorators =
  'canHaveDecorators' in ts && typeof ts.canHaveDecorators === 'function'
const getDecorators =
  'getDecorators' in ts && typeof ts.getDecorators === 'function'

const readDecorators = (node: ts.Node): readonly ts.Decorator[] => {
  if (canHaveDecorators && getDecorators && ts.canHaveDecorators(node)) {
    return (ts.getDecorators(node) ?? []) as ts.Decorator[]
  }

  const decoratedNode = node as ts.Node & {
    decorators?: ts.NodeArray<ts.Decorator>
    modifiers?: ts.NodeArray<ts.ModifierLike>
  }

  if (decoratedNode.decorators) {
    return [...decoratedNode.decorators]
  }

  return (
    decoratedNode.modifiers?.filter(
      (modifier): modifier is ts.Decorator =>
        modifier.kind === ts.SyntaxKind.Decorator,
    ) ?? []
  )
}

const tsNodeHasModelDecorator = (node: ts.Node) =>
  readDecorators(node).some((decorator) => {
    const { expression } = decorator

    if (ts.isIdentifier(expression)) {
      return MODEL_DECORATORS.has(expression.text)
    }

    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
      return MODEL_DECORATORS.has(expression.expression.text)
    }

    return false
  })

const isGraphqlModelSymbol = (
  node: TSESTree.Node,
  services: ParserServices,
  checker: ts.TypeChecker,
) => {
  const tsNode = services.esTreeNodeToTSNodeMap.get(node)

  if (!tsNode) {
    return false
  }

  let symbol = checker.getSymbolAtLocation(tsNode) ?? undefined

  if (!symbol) {
    const typeAtLocation = checker.getTypeAtLocation(tsNode)
    symbol = typeAtLocation.aliasSymbol ?? typeAtLocation.symbol
  }

  if (!symbol) {
    return false
  }

  if (symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol)
  }

  return (
    symbol.declarations?.some(
      (declaration) =>
        (ts.isClassDeclaration(declaration) ||
          ts.isClassExpression(declaration)) &&
        tsNodeHasModelDecorator(declaration),
    ) ?? false
  )
}

const analyzeModelClass = (
  node: TSESTree.ClassDeclaration,
  context: Readonly<RuleContext<MessageIds, Options>>,
  services: ParserServices | undefined,
  checker: ts.TypeChecker | undefined,
  allowedScalars: Set<string>,
  localModelNames: Set<string>,
  hasTypeInformation: boolean,
) => {
  const { body } = node.body

  for (const member of body) {
    if (member.type !== AST_NODE_TYPES.PropertyDefinition) {
      continue
    }

    const fieldDecorator = member.decorators?.find(isFieldDecorator)

    if (!fieldDecorator) {
      continue
    }

    const typeInfos = [
      ...extractTypeInfosFromDecorator(fieldDecorator),
      ...extractTypeInfosFromTypeNode(member.typeAnnotation?.typeAnnotation),
    ]

    const uniqueTypeInfos = typeInfos.filter((info, index, list) => {
      return list.findIndex((nested) => nested.name === info.name) === index
    })

    for (const typeInfo of uniqueTypeInfos) {
      if (allowedScalars.has(typeInfo.name)) {
        continue
      }

      const isLocalModel = localModelNames.has(typeInfo.name)
      const isModelViaTypeInformation =
        Boolean(
          hasTypeInformation &&
            checker &&
            services &&
            services.program &&
            isGraphqlModelSymbol(typeInfo.node, services, checker),
        )
      const isModel = isLocalModel || isModelViaTypeInformation

      if (!isModel) {
        continue
      }

      context.report({
        node: member.key,
        messageId: 'nestedModelField',
        data: { typeName: typeInfo.name },
      })

      break
    }
  }
}

export const rule = createRule<Options, MessageIds>({
  name: 'require-resolve-field-for-nested-models',
  meta: {
    messages: {
      nestedModelField:
        'Define the "{{typeName}}" relationship via @ResolveField instead of declaring it on the model.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          scalars: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        additionalProperties: false,
      },
    ],
    docs: {
      description:
        'Disallow declaring object relationships on @ObjectType classes so they are resolved via @ResolveField.',
    },
    type: 'problem',
  },
  defaultOptions: [{}],
  create: (context, [options] = [{}]) => {
    const allowedScalars = new Set([
      ...DEFAULT_SCALARS,
      ...(options?.scalars ?? []),
    ])

    const services = context.parserServices
    const checker = services?.program?.getTypeChecker()
    const hasTypeInformation =
      Boolean(
        checker &&
          services &&
          'esTreeNodeToTSNodeMap' in services &&
          'tsNodeToESTreeNodeMap' in services,
      )

    const modelClasses: TSESTree.ClassDeclaration[] = []
    const localModelNames = new Set<string>()

    return {
      ClassDeclaration(node) {
        if (!node.decorators?.some((decorator) => decoratorHasName(decorator, MODEL_DECORATORS))) {
          return
        }

        if (node.id) {
          localModelNames.add(node.id.name)
        }

        modelClasses.push(node)
      },
      'Program:exit'() {
        for (const modelClass of modelClasses) {
          analyzeModelClass(
            modelClass,
            context,
            services,
            checker,
            allowedScalars,
            localModelNames,
            hasTypeInformation,
          )
        }
      },
    }
  },
})
