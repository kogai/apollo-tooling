import {
  GraphQLObjectType,
  GraphQLEnumType,
  GraphQLInputObjectType
} from "graphql";
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
    expect(errors).toHaveLength(0);
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

  describe("basic type extensions", () => {
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
      expect(errors).toHaveLength(0);
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
          extend type Product {
            price: Int!
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          type Product {
            sku: String!
            name: String!
          }
        `,
        name: "serviceB"
      };
      const { schema, errors } = composeServices([serviceA, serviceB]);
      expect(errors).toHaveLength(0);
      expect(schema).toBeDefined();

      expect(schema.getType("Product")).toMatchInlineSnapshot(`
type Product {
  sku: String!
  name: String!
  price: Int!
}
`);

      const product = schema.getType("Product") as GraphQLObjectType;

      expect(product.serviceName).toEqual("serviceB");
      expect(product.getFields()["price"].serviceName).toEqual("serviceA");
    });

    it("works with multiple extensions on the same type", () => {
      const serviceA = {
        typeDefs: gql`
          extend type Product {
            price: Int!
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          type Product {
            sku: String!
            name: String!
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

      const { schema, errors } = composeServices([
        serviceA,
        serviceB,
        serviceC
      ]);
      expect(errors).toHaveLength(0);
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

      expect(product.serviceName).toEqual("serviceB");
      expect(product.getFields()["price"].serviceName).toEqual("serviceA");
      expect(product.getFields()["color"].serviceName).toEqual("serviceC");
    });

    it("allows extensions to overwrite other extension fields", () => {
      const serviceA = {
        typeDefs: gql`
          extend type Product {
            price: Int!
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          type Product {
            sku: String!
            name: String!
          }
        `,
        name: "serviceB"
      };

      const serviceC = {
        typeDefs: gql`
          extend type Product {
            price: Float!
            color: String!
          }
        `,
        name: "serviceC"
      };

      const { schema, errors } = composeServices([
        serviceA,
        serviceB,
        serviceC
      ]);
      expect(errors).toMatchInlineSnapshot(`
Array [
  [GraphQLError: Field "Product.price" can only be defined once.],
]
`);
      expect(schema).toBeDefined();

      const product = schema.getType("Product") as GraphQLObjectType;
      expect(product).toMatchInlineSnapshot(`
type Product {
  sku: String!
  name: String!
  price: Float!
  color: String!
}
`);

      expect(product.serviceName).toEqual("serviceB");
      expect(product.getFields()["price"].serviceName).toEqual("serviceC");
    });

    it("preserves arguments for fields", () => {
      const serviceA = {
        typeDefs: gql`
          enum Curr {
            USD
            GBP
          }

          extend type Product {
            price(currency: Curr!): Int!
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          type Product {
            sku: String!
            name(type: String): String!
          }
        `,
        name: "serviceB"
      };
      const { schema, errors } = composeServices([serviceA, serviceB]);
      expect(errors).toHaveLength(0);
      expect(schema).toBeDefined();

      expect(schema.getType("Product")).toMatchInlineSnapshot(`
type Product {
  sku: String!
  name(type: String): String!
  price(currency: Curr!): Int!
}
`);

      const product = schema.getType("Product") as GraphQLObjectType;
      expect(product.getFields()["price"].args[0].name).toEqual("currency");
    });

    it("treats type extensions as a base type definition when none is available", () => {
      const serviceA = {
        typeDefs: gql`
          extend type Product {
            price: Float!
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          extend type Product {
            color: String!
          }
        `,
        name: "serviceB"
      };

      const { schema, errors } = composeServices([serviceA, serviceB]);
      expect(errors).toHaveLength(0);
      expect(schema).toBeDefined();

      expect(schema.getType("Product")).toMatchInlineSnapshot(`
type Product {
  price: Float!
  color: String!
}
`);

      const product = schema.getType("Product") as GraphQLObjectType;

      expect(product.serviceName).toEqual(null);
    });

    // This is a limitation of extendSchema currently (this is currently a broken test to demonstrate)
    it.skip("overwrites field on extension by base type when base type comes second", () => {
      const serviceA = {
        typeDefs: gql`
          extend type Product {
            sku: String!
            name: String!
          }
        `,
        name: "serviceA"
      };
      const serviceB = {
        typeDefs: gql`
          type Product {
            sku: String!
            name: String!
          }
        `,
        name: "serviceB"
      };

      const { schema, errors } = composeServices([serviceA, serviceB]);
      expect(schema).toBeDefined();
      expect(errors).toMatchInlineSnapshot(`
  Array [
    [GraphQLError: Field "Product.sku" already exists in the schema. It cannot also be defined in this type extension.],
    [GraphQLError: Field "Product.name" already exists in the schema. It cannot also be defined in this type extension.],
  ]
  `);

      const product = schema.getType("Product") as GraphQLObjectType;

      expect(product).toMatchInlineSnapshot(`
  type Product {
    sku: String!
    name: String!
  }
  `);
      expect(product.getFields()["sku"].serviceName).toEqual("serviceB");
      expect(product.getFields()["name"].serviceName).toEqual("serviceB");
    });

    describe("collisions & error handling", () => {
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
  [GraphQLError: Field "Product.name" already exists in the schema. It cannot also be defined in this type extension.],
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

      it("report multiple errors correctly", () => {
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
              sku: String!
              name: String!
            }
          `,
          name: "serviceB"
        };

        const { schema, errors } = composeServices([serviceA, serviceB]);
        expect(schema).toBeDefined();
        expect(errors).toMatchInlineSnapshot(`
Array [
  [GraphQLError: Field "Product.sku" already exists in the schema. It cannot also be defined in this type extension.],
  [GraphQLError: Field "Product.name" already exists in the schema. It cannot also be defined in this type extension.],
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

      it("handles collisions of base types as expected (newest takes precedence)", () => {
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
            type Product {
              id: ID!
              name: String!
              price: Int!
            }
          `,
          name: "serviceB"
        };

        const { schema, errors } = composeServices([serviceA, serviceB]);
        expect(schema).toBeDefined();
        expect(errors).toMatchInlineSnapshot(`
Array [
  [GraphQLError: There can be only one type named "Product".],
  [GraphQLError: Field "Product.name" can only be defined once.],
]
`);

        const product = schema.getType("Product") as GraphQLObjectType;

        expect(product).toMatchInlineSnapshot(`
type Product {
  id: ID!
  name: String!
  price: Int!
}
`);
      });
    });
  });

  // Maybe just test conflicts in types
  // it("interfaces, unions", () => {});

  describe("input and enum type extensions", () => {
    it("extends input types", () => {
      const serviceA = {
        typeDefs: gql`
          input ProductInput {
            sku: String!
            name: String!
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          extend input ProductInput {
            color: String!
          }
        `,
        name: "serviceB"
      };

      const { schema, errors } = composeServices([serviceA, serviceB]);
      expect(schema).toBeDefined();
      expect(errors).toMatchInlineSnapshot(`Array []`);

      const colorField = (schema.getType(
        "ProductInput"
      ) as GraphQLInputObjectType).getFields()["color"];

      expect(colorField.serviceName).toEqual("serviceB");
    });

    it("extends enum types", () => {
      const serviceA = {
        typeDefs: gql`
          enum ProductCategory {
            BED
            BATH
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          extend enum ProductCategory {
            BEYOND
          }
        `,
        name: "serviceB"
      };

      const { schema, errors } = composeServices([serviceA, serviceB]);
      expect(schema).toBeDefined();
      expect(errors).toMatchInlineSnapshot(`Array []`);

      const category = schema.getType("ProductCategory") as GraphQLEnumType;
      expect(category.serviceName).toEqual("serviceA");
      expect(category.getValue("BEYOND").serviceName).toEqual("serviceB");
    });

    it("uses most recent type declaration for enums", () => {
      const serviceA = {
        typeDefs: gql`
          enum ProductCategory {
            BED
            BATH
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          enum ProductCategory {
            BEYOND
          }
        `,
        name: "serviceB"
      };

      const { schema, errors } = composeServices([serviceA, serviceB]);
      expect(schema).toBeDefined();
      expect(errors).toMatchInlineSnapshot(`
Array [
  [GraphQLError: There can be only one type named "ProductCategory".],
]
`);

      const category = schema.getType("ProductCategory") as GraphQLEnumType;
      expect(category).toMatchInlineSnapshot(`
enum ProductCategory {
  BEYOND
}
`);

      expect(category.serviceName).toEqual("serviceB");
    });
  });

  describe("interfaces", () => {
    // TODO: should there be a validation warning of some sort for this?
    it("allows overwriting a type that implements an interface improperly", () => {
      const serviceA = {
        typeDefs: gql`
          interface Item {
            id: ID!
          }

          type Product implements Item {
            id: ID!
            sku: String!
            name: String!
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          extend type Product {
            id: String!
          }
        `,
        name: "serviceB"
      };

      const { schema, errors } = composeServices([serviceA, serviceB]);
      expect(errors).toMatchInlineSnapshot(`
Array [
  [GraphQLError: Field "Product.id" already exists in the schema. It cannot also be defined in this type extension.],
]
`);

      expect(schema).toBeDefined();

      expect(schema.getType("Product")).toMatchInlineSnapshot(`
type Product implements Item {
  id: String!
  sku: String!
  name: String!
}
`);

      const product = schema.getType("Product") as GraphQLObjectType;

      expect(product.serviceName).toEqual("serviceA");
      expect(product.getFields()["id"].serviceName).toEqual("serviceB");
    });
  });

  describe("root type extensions", () => {
    // TODO
    it("allows extension of the Query type with no base type definition", () => {
      const serviceA = {
        typeDefs: gql`
          extend type Query {
            products: [ID!]
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          extend type Query {
            people: [ID!]
          }
        `,
        name: "serviceB"
      };

      const { schema, errors } = composeServices([serviceA, serviceB]);
      expect(errors).toHaveLength(0);
      expect(schema).toBeDefined();

      expect(schema.getType("Query")).toMatchInlineSnapshot(`
type Query {
  products: [ID!]
  people: [ID!]
}
`);

      const query = schema.getType("Query") as GraphQLObjectType;

      expect(query.serviceName).toEqual(null);
    });

    xit("", () => {
      // same as above, but use schema.getQueryType()
    });

    // TODO
    xit("treats root type definitions as extensions, not base definitions", () => {
      const serviceA = {
        typeDefs: gql`
          type Query {
            products: [ID!]
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          extend type Query {
            people: [ID!]
          }
        `,
        name: "serviceB"
      };

      const { schema, errors } = composeServices([serviceA, serviceB]);
      expect(errors).toHaveLength(0);
      expect(schema).toBeDefined();

      expect(schema.getType("Query")).toMatchInlineSnapshot(`
type Query {
  products: [ID!]
  people: [ID!]
}
`);

      const query = schema.getType("Query") as GraphQLObjectType;

      expect(query.serviceName).toBeUndefined();
    });

    // TODO: not sure what to do here. Haven't looked into it yet :)
    it.skip("works with custom root types", () => {});
  });

  describe("federation directives", () => {
    // What's next?
    // Directives - allow schema (federation) directives
    it("does not redefine fields with @external when composing", () => {
      const serviceA = {
        typeDefs: gql`
          type Product @key(fields: "sku") {
            sku: String!
            name: String!
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          extend type Product {
            sku: String! @external
            price: Int! @requires(fields: "sku")
          }
        `,
        name: "serviceB"
      };

      const { schema, errors } = composeServices([serviceA, serviceB]);
      expect(schema).toBeDefined();
      expect(errors).toHaveLength(0);

      const product = schema.getType("Product") as GraphQLObjectType;

      expect(product).toMatchInlineSnapshot(`
type Product {
  sku: String!
  name: String!
  price: Int!
}
`);
      expect(product.getFields()["price"].serviceName).toEqual("serviceB");
      expect(product.serviceName).toEqual("serviceA");
    });

    it("add @requires information to fields with the requires directive", () => {
      const serviceA = {
        typeDefs: gql`
          type Product @key(fields: "sku") {
            sku: String!
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          extend type Product {
            sku: String! @external
            price: Int! @requires(fields: "sku")
          }
        `,
        name: "serviceB"
      };

      const { schema, errors } = composeServices([serviceA, serviceB]);
      const product = schema.getType("Product") as GraphQLObjectType;
      expect(product.getFields()["price"].requires).toEqual("sku");
    });

    it("add @key information to types", () => {
      const serviceA = {
        typeDefs: gql`
          type Product @key(fields: "sku") @key(fields: "upc") {
            sku: String!
            upc: String!
          }
        `,
        name: "serviceA"
      };

      const serviceB = {
        typeDefs: gql`
          extend type Product {
            sku: String! @external
            price: Int! @requires(fields: "sku")
          }
        `,
        name: "serviceB"
      };

      const { schema, errors } = composeServices([serviceA, serviceB]);
      const product = schema.getType("Product") as GraphQLObjectType;
      expect(product.keys).toEqual(["sku", "upc"]);
    });
  });
});

// XXX Ignored/unimplemented spec tests
// it("allows extension of custom scalars", () => {});

// Every service that includes an enum type in its schema needs to be compatible with definitions of the same type in other services.
// For now, if two of the same enums exist, the last one wins
