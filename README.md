# eslint-plugin-nestjs-graphql

[![npm](https://img.shields.io/npm/v/eslint-plugin-nestjs-graphql.svg)](https://www.npmjs.com/package/eslint-plugin-nestjs-graphql)

This plugin intends to prevent issues with returning the wrong type from NestJS GraphQL resolvers. Relevant to [Code first](https://docs.nestjs.com/graphql/quick-start#code-first) approach.

## Rules

The plugin supports rules:

`matching-return-type`
`matching-resolve-field-parent-type`
`matching-args-type`
`matching-field-type`
`require-resolve-field-for-nested-models`
`require-resolver-type-arg-with-resolve-field`
`no-optional-fields-in-object-type`
`no-redundant-field-decorator`

## Motivation

### matching-return-type

When Code first approach is used, NestJS generates schema based on the decorators such as `ResolveField`, `Query`, or `Mutation` which define the type of the returned value. However, the type of the returned value is not checked by TypeScript compiler. 

A query defined as:

```typescript
  @Query(returns => Author)
  async author(@Args('id', { type: () => Int }) id: number) {
    return this.authorsService.findOneById(id);
  }
```

can be implemented to return any type of value, e.g. `Promise<string>`. This will not be caught by TypeScript compiler, but will result in runtime error when the GraphQL schema is generated.

This rule aims to solve this issue by checking the type of the returned value.

*Valid*

```typescript
  @Query(returns => Author)
  async author(@Args('id', { type: () => Int }) id: number): Author {
    return this.authorsService.findOneById(id);
  }
```

```typescript
  @Query(returns => Author)
  async author(@Args('id', { type: () => Int }) id: number): Promise<Author> {
    return this.authorsService.findOneById(id);
  }
```

```typescript
  @Query(returns => [Author])
  async author(@Args('id', { type: () => Int }) id: number): Promise<Author[]> {
    return this.authorsService.findOneById(id);
  }
```

```typescript
  @Query(returns => [Author], { nullable: true })
  async author(@Args('id', { type: () => Int }) id: number): Promise<Author[] | null> {
    return this.authorsService.findOneById(id);
  }
```

*Invalid*

```typescript
  @Query(returns => Author)
  async author(@Args('id', { type: () => Int }) id: number): string {
    return this.authorsService.findOneById(id);
  }
```

```typescript
  @Query(returns => Author)
  async author(@Args('id', { type: () => Int }) id: number): Promise<Author | null> {
    return this.authorsService.findOneById(id);
  }
```

```typescript
  @Query(returns => Author)
  async author(@Args('id', { type: () => Int }) id: number): Promise<Author[]> {
    return this.authorsService.findOneById(id);
  }
```

### matching-resolve-field-parent-type

When resolving a field, the `@Parent()` decorator's type can mismatch the type returned from the `@Resolver()` decorator of the class. This may result in runtime error or unexpected behavior.

This rule aims to solve this issue by checking the type of the `@Parent` against `@Resolver()`.

*Valid*

```typescript
  @Resolver(() => Author)
  class AuthorResolver {
    @ResolveField(() => [Book])
    async books(@Parent() author: Author): Promise<Book[]> {
      return this.booksService.findAllByAuthorId(author.id);
    }
  }
```

```typescript
  @Resolver(Author)
  class AuthorResolver {
    @ResolveField(returns => [Book])
    async books(@Parent() author: Author): Promise<Book[]> {
      return this.booksService.findAllByAuthorId(author.id);
    }
  }
```

*Invalid*

```typescript
  @Resolver()
  class AuthorResolver {
    @ResolveField(returns => [Book])
    async books(@Parent() author: Author): Promise<Book[]> {
      return this.booksService.findAllByAuthorId(author.id);
    }
  }
```

```typescript
  @Resolver(Author)
  class AuthorResolver {
    @ResolveField(returns => [Book])
    async books(@Parent() author: Book): Promise<Book[]> {
      return this.booksService.findAllByAuthorId(author.id);
    }
  }
```

### require-resolve-field-for-nested-models

GraphQL object relationships should be resolved in dedicated resolvers using `@ResolveField`. Declaring nested models directly on another `@ObjectType()` can lead to unexpected schema nesting and makes it harder to reuse resolvers.

*Valid*

```typescript
@ObjectType()
class User {
  @Field(() => ID)
  id!: string;
}

@Resolver(() => User)
class UserResolver {
  @ResolveField(() => Profile)
  profile(@Parent() user: User): Promise<Profile> {
    return this.profileService.byUserId(user.id);
  }
}
```

*Invalid*

```typescript
@ObjectType()
class User {
  @Field(() => Profile)
  profile!: Profile;
}
```

### matching-args-type

Mirrors `matching-return-type`, but on `@Args` parameters. When `@Args('name', { type: () => X, nullable?: ... })` is given, this rule verifies that the TypeScript parameter type matches the declared `type`, and that the `nullable` option agrees with the annotation. Array nullability is modelled distinctly:

| `nullable` option       | expected TS shape          |
| ----------------------- | -------------------------- |
| `true`                  | `X \| null` or `X[] \| null` |
| `'items'`               | `(X \| null)[]`            |
| `'itemsAndList'`        | `(X \| null)[] \| null`    |

All three of `| null`, `| undefined`, and `?:` are accepted to express nullability at the list level, but `| null` is recommended for consistency with `no-optional-fields-in-object-type`. When `@Args` has no options object, analysis is skipped — the compiler plugin infers from TypeScript, so there's nothing to drift.

*Valid*

```typescript
  @Query(() => User)
  user(
    @Args('id', { type: () => Int }) id: number,
    @Args('filter', { type: () => String, nullable: true }) filter: string | null,
    @Args('tags', { type: () => [String], nullable: 'items' }) tags: (string | null)[],
  ) { ... }
```

*Invalid*

```typescript
  @Query(() => User)
  user(@Args('id', { type: () => Int }) id: string) { ... }  // Int vs string
```

```typescript
  @Query(() => User)
  user(@Args('id', { type: () => Int, nullable: true }) id: number) { ... }  // nullable: true without | null
```

```typescript
  @Query(() => [User])
  users(
    @Args('ids', { type: () => [Int], nullable: 'items' }) ids: number[],  // decorator says items nullable, type doesn't
  ) { ... }
```

### require-resolver-type-arg-with-resolve-field

`@Resolver()` without a parent type argument is incompatible with `@ResolveField` methods (they need a parent to attach to). This rule fails the class-level `@Resolver()` decorator whenever it contains any `@ResolveField`. Complements `matching-resolve-field-parent-type`, which only fires when a `@Parent()` parameter is present.

*Valid*

```typescript
@Resolver(() => User)
class UserResolver {
  @ResolveField(() => [Post])
  posts(@Parent() user: User) { ... }
}
```

*Invalid*

```typescript
@Resolver()
class UserResolver {
  @ResolveField(() => [Post])
  posts(@Parent() user: User) { ... }
}
```

### matching-field-type

Parity rule for `@Field`-decorated properties on `@ObjectType`, `@InputType`, and `@ArgsType` classes. Same contract as `matching-args-type` — verifies the TypeScript property type matches the decorator's type argument, and that `nullable` agrees with the annotation (including the `'items'` and `'itemsAndList'` forms for arrays). Properties without an explicit `@Field` are skipped: the NestJS GraphQL compiler plugin infers their type from TypeScript.

*Valid*

```typescript
@ObjectType()
class User {
  @Field(() => ID) id!: string;
  @Field(() => String, { nullable: true }) nickname!: string | null;
  @Field(() => [String], { nullable: 'items' }) tags!: (string | null)[];
}
```

*Invalid*

```typescript
@ObjectType()
class User {
  @Field(() => Int) name!: string;                // Int vs string
  @Field(() => String) nickname!: string | null;  // TS nullable, decorator isn't
}
```

### no-redundant-field-decorator

Autofixes away `@Field` decorators that carry no information the NestJS GraphQL compiler plugin can't derive from TypeScript — i.e. no `type: () => X` function and a TS type that's one of `string`, `number`, `boolean`. Trivial options (`nullable`, `description`) don't rescue the decorator; any other option does. **This rule assumes the compiler plugin is enabled in your `nest-cli.json` — otherwise `@Field` is mandatory and should not be stripped.**

*Valid* (decorator is load-bearing — skipped)

```typescript
@ObjectType()
class User {
  @Field(() => Int) count!: number;                       // explicit type function
  @Field({ complexity: 5 }) name!: string;                // non-trivial option
  @Field() profile!: Profile;                             // non-primitive TS type
}
```

*Invalid* (autofixable — decorator will be removed)

```typescript
@ObjectType()
class User {
  @Field() name!: string;
  @Field({ nullable: true }) nickname!: string | null;
  @Field({ description: 'The user display name' }) displayName!: string;
}
```

### no-optional-fields-in-object-type

Optional (`?`) properties on `@ObjectType` classes are easy to forget to populate — the value is silently `undefined` and the field is absent from the response. Requiring `| null` instead forces an explicit assignment at every construction site, so a missing value becomes a TypeScript error.

*Valid*

```typescript
@ObjectType()
class User {
  id!: string;
  nickname!: string | null;
}
```

*Invalid*

```typescript
@ObjectType()
class User {
  id!: string;
  nickname?: string;
}
```

## Branded / flavored types

The three `matching-*-type` rules compare the GraphQL scalar declared on the decorator (`String`, `Int`, `ID`, …) against the TypeScript annotation. By default the comparison is pure-AST, so a branded string like

```typescript
type AIFDocumentId = Flavor<string, '__AIFDocumentId'>
```

would be treated as an unknown type — `@Args({ type: () => ID }) id: AIFDocumentId` would false-positive as a mismatch.

To fix this, enable typed linting by setting `parserOptions.project` (or `projectService`) in your ESLint config. When available, the rules use the TypeScript type checker to resolve the actual type — `Flavor<string, …>`, `Brand<T, …>`, intersections of `string`, aliases of aliases, etc. all reduce to their apparent primitive (`string` / `number` / `boolean`) and match the corresponding scalar.

Without typed linting, the rules fall back to the same AST-only comparison used in earlier versions — any non-primitive identifier that doesn't literally match the scalar name is flagged as a mismatch, which will false-positive on branded types. Enable typed linting to avoid this.

## Installation

```sh
# inside your project's working tree
npm i eslint-plugin-nestjs-graphql --save-dev
```

The rules are off by default. To turn them on, add the following to your `.eslintrc` file:

```json
{
  "plugins": ["nestjs-graphql"],
  "rules": {
    "nestjs-graphql/matching-return-type": "error", // `error` level is recommended
    "nestjs-graphql/matching-resolve-field-parent-type": "error", // `error` level is recommended
    "nestjs-graphql/matching-args-type": "error", // `error` level is recommended
    "nestjs-graphql/matching-field-type": "error", // `error` level is recommended
    "nestjs-graphql/require-resolve-field-for-nested-models": "error", // `error` level is recommended
    "nestjs-graphql/require-resolver-type-arg-with-resolve-field": "error", // `error` level is recommended
    "nestjs-graphql/no-optional-fields-in-object-type": "error", // `error` level is recommended
    "nestjs-graphql/no-redundant-field-decorator": "error", // compiler-plugin only; see rule docs
  }
}
```
