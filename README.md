# eslint-plugin-nestjs-graphql

[![npm](https://img.shields.io/npm/v/eslint-plugin-nestjs-graphql.svg)](https://www.npmjs.com/package/eslint-plugin-nestjs-graphql)

This plugin intends to prevent issues with returning the wrong type from NestJS GraphQL resolvers. Relevant to [Code first](https://docs.nestjs.com/graphql/quick-start#code-first) approach.

## Motivation

When Code first approach is used, NestJS generates schema based on the decorators such as `ResolveField`, `Query`, or `Mutation` which define the type of the returned value. However, the type of the returned value is not checked by TypeScript compiler. 

A query defined as:

```typescript
  @Query(returns => Author)
  async author(@Args('id', { type: () => Int }) id: number) {
    return this.authorsService.findOneById(id);
  }
```

can be implemented to return any type of value, e.g. `Promise<string>`. This will not be caught by TypeScript compiler, but will result in runtime error when the GraphQL schema is generated.

This plugin aims to solve this issue by checking the type of the returned value.

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

## Rules

The plugin supports only one rule: `matching-return-type`.

## Installation

```sh
# inside your project's working tree
npm eslint-plugin-nestjs-graphql --save-dev
```

The rule is off by default. To turn it on, add the following to your `.eslintrc` file:

```json
{
  "plugins": ["nestjs-graphql"],
  "rules": {
    "nestjs-graphql/matching-return-type": "error" // `error` level is recommended
  }
}
```
