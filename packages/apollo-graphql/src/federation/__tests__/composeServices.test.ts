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

    it.skip("handles overwriting of extension field by base type when two extensions overwrite the same field", () => {});

    it.skip("preserves arguments for fields", () => {});

    it.skip("treats type extensions as a base type definition when none is available", () => {});

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

    it.skip("uses most recent type declaration for enums", () => {});
  });

  describe("interfaces", () => {
    it.skip("warns when overwriting a type that implements an interface improperly", () => {});
  });

  describe("root type extensions", () => {
    it.skip("allows extension of the Query type with no base type definition", () => {});
    it.skip("treats root type definitions as extensions, not base definitions", () => {});
    it.skip("works with custom root types", () => {});
  });

  describe("federation directives", () => {
    // What's next?
    // Directives - allow schema (federation) directives
    it.skip("allows federation directives", () => {
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
      expect(errors).toMatchInlineSnapshot(`Array []`);

      const product = schema.getType("Product") as GraphQLObjectType;

      expect(product).toMatchInlineSnapshot(`
type Product {
  sku: String!
  name: String!
  price: Int!
}
`);
      expect(product.getFields()["price"].serviceName).toEqual("serviceB");
      expect(product.getFields()["sku"].serviceName).toEqual("serviceA");
    });
  });
});

// XXX Ignored/unimplemented spec tests
// it("allows extension of custom scalars", () => {});
