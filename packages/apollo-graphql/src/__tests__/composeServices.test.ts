import { GraphQLObjectType } from "graphql";
import gql from "graphql-tag";
import { composeServices } from "../composeServices";

describe("composeServices", () => {
  it("should include types from different services", () => {
    const serviceA = {
      typeDefs: gql`
        type Product {
          sku: String!
          name: String!
        }
      `,
      name: "serviceA"
    };

    const serviceB = {
      typeDefs: gql`
        type User {
          name: String
          email: String!
        }
      `,
      name: "serviceB"
    };

    const { schema, errors } = composeServices([serviceA, serviceB]);
    expect(errors).toBeUndefined();
    expect(schema).toBeDefined();

    expect(schema.getType("User")).toMatchInlineSnapshot(`
type User {
  name: String
  email: String!
}
`);

    expect(schema.getType("Product")).toMatchInlineSnapshot(`
type Product {
  sku: String!
  name: String!
}
`);

    const product = schema.getType("Product") as GraphQLObjectType;
    const user = schema.getType("User") as GraphQLObjectType;

    expect(product.serviceName).toEqual("serviceA");
    expect(user.serviceName).toEqual("serviceB");
  });

  describe("should extend type from different service", () => {
    it("works when extension service is second", () => {
      const serviceA = {
        typeDefs: gql`
          type Product {
            sku: String!
            name: String!
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          extend type Product {
            price: Int!
          }
        `,
        name: "serviceB"
      };

      const { schema, errors } = composeServices([serviceA, serviceB]);
      expect(errors).toBeUndefined();
      expect(schema).toBeDefined();

      expect(schema.getType("Product")).toMatchInlineSnapshot(`
type Product {
  sku: String!
  name: String!
  price: Int!
}
`);

      const product = schema.getType("Product") as GraphQLObjectType;

      expect(product.serviceName).toEqual("serviceA");
      expect(product.getFields()["price"].serviceName).toEqual("serviceB");
    });

    it("works when extension service is first", () => {
      const serviceA = {
        typeDefs: gql`
          type Product {
            sku: String!
            name: String!
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          extend type Product {
            price: Int!
          }
        `,
        name: "serviceB"
      };

      const { schema, errors } = composeServices([serviceB, serviceA]);
      expect(errors).toBeUndefined();
      expect(schema).toBeDefined();

      expect(schema.getType("Product")).toMatchInlineSnapshot(`
type Product {
  sku: String!
  name: String!
  price: Int!
}
`);

      const product = schema.getType("Product") as GraphQLObjectType;

      expect(product.serviceName).toEqual("serviceA");
      expect(product.getFields()["price"].serviceName).toEqual("serviceB");
    });
  });

  it("works with multiple extensions on the same type", () => {
    const serviceA = {
      typeDefs: gql`
        type Product {
          sku: String!
          name: String!
        }
      `,
      name: "serviceA"
    };

    const serviceB = {
      typeDefs: gql`
        extend type Product {
          price: Int!
        }
      `,
      name: "serviceB"
    };

    const serviceC = {
      typeDefs: gql`
        extend type Product {
          color: String!
        }
      `,
      name: "serviceC"
    };

    const { schema, errors } = composeServices([serviceB, serviceA, serviceC]);
    expect(errors).toBeUndefined();
    expect(schema).toBeDefined();

    expect(schema.getType("Product")).toMatchInlineSnapshot(`
type Product {
  sku: String!
  name: String!
  price: Int!
  color: String!
}
`);

    const product = schema.getType("Product") as GraphQLObjectType;

    expect(product.serviceName).toEqual("serviceA");
    expect(product.getFields()["price"].serviceName).toEqual("serviceB");
    expect(product.getFields()["color"].serviceName).toEqual("serviceC");
  });

  // Brainstorm result, these test cases should be reworded and properly defined

  it("handles collisions on type extensions as expected", () => {
    const serviceA = {
      typeDefs: gql`
        type Product {
          sku: String!
          name: String!
        }
      `,
      name: "serviceA"
    };

    const serviceB = {
      typeDefs: gql`
        extend type Product {
          name: String!
        }
      `,
      name: "serviceB"
    };

    const { schema, errors } = composeServices([serviceA, serviceB]);
    expect(schema).toBeDefined();
    expect(errors).toMatchInlineSnapshot(`
Array [
  [Error: Field "Product.name" already exists in the schema. It cannot also be defined in this type extension.],
]
`);

    const product = schema.getType("Product") as GraphQLObjectType;

    expect(product).toMatchInlineSnapshot(`
type Product {
  sku: String!
  name: String!
}
`);
    expect(product.getFields()["name"].serviceName).toEqual("serviceB");
  });

  it("handles collisions of base types expected (newest takes precedence)", () => {});

  it("lists, non-null, interfaces, unions, input, enum types", () => {});

  it("extending these -> lists, non-null, interfaces, unions, input, enums types", () => {});

  it("using arguments (are they preserved, etc.)", () => {});

  it("merges two+ schemas that only _extend_ query. should we ever be able to not define query", () => {});

  it("custom scalars / extending them", () => {});

  it("handles collisions on type extensions as expected", () => {});
});
