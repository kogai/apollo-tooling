import "apollo-env";
import gql from "graphql-tag";
import {
  GraphQLObjectType,
  GraphQLSchema,
  extendSchema,
  Kind,
  DocumentNode,
  GraphQLDirective,
  TypeDefinitionNode,
  TypeExtensionNode,
  isTypeDefinitionNode,
  isTypeExtensionNode,
  concatAST
} from "graphql";

declare module "graphql/type/definition" {
  interface GraphQLObjectType {
    serviceName?: string;
  }

  interface GraphQLField<TSource, TContext> {
    serviceName?: string;
  }
}

interface ServiceDefinition {
  typeDefs: DocumentNode;
  name: string;
}

function composeServices(services: ServiceDefinition[]) {
  // Map of all definitions to eventually be passed to extendSchema
  const definitionsMap: {
    [name: string]: TypeDefinitionNode[];
  } = Object.create(null);

  // Map of all extensions to eventually be passed to extendSchema
  const extensionsMap: {
    [name: string]: TypeExtensionNode[];
  } = Object.create(null);

  /**
   * A map of base types to their owning service. Used by query planner to direct traffic.
   * This contains the base type's "owner". Any fields that extend this type in another service
   * are listed under "extensionFields". extensionFields are in the format { myField: my-service-name }
   *
   * Example services with resulting serviceMap shape
   *
   * ProductService:
   * type Product {
   *   sku: String!
   *   color: String
   * }
   *
   * ReviewService:
   * extend type Product {
   *   reviews: [Review!]!
   * }
   *
   * ShippingService:
   * extend type Product {
   *   dimensions: [Dimensions!]
   *   weight: Int
   * }
   *
   * const serviceMap = {
   *   Product: {
   *     serviceName: "ProductService",
   *     extensionFields: {
   *       reviews: "ReviewService",
   *       dimensions: "ShippingService",
   *       weight: "ShippingService"
   *     }
   *   }
   * }
   */

  /**
   * XXX I want to rename this map to something that feels more directionally intutitive:
   * typesMap
   * typeToServiceMap
   * typeWithExtensionsMap
   * typeWithExtensionsToServiceMap
   */
  const serviceMap: {
    [typeName: string]: {
      serviceName?: string;
      extensionFields: { [fieldName: string]: string };
    };
  } = Object.create(null);

  for (const { typeDefs, name: serviceName } of services) {
    for (const definition of typeDefs.definitions) {
      if (isTypeDefinitionNode(definition)) {
        const typeName = definition.name.value;

        /**
         * This type is a base definition (not an extension). If this type is already in the serviceMap, then
         * 1. It was declared by a previous service, but this newer one takes precedence, or...
         * 2. It was extended by a service before declared
         */
        if (serviceMap[typeName]) {
          serviceMap[typeName].serviceName = serviceName;
        } else {
          serviceMap[typeName] = {
            serviceName,
            extensionFields: Object.create(null)
          };
        }

        /**
         * If this type already exists in the definitions map, push this definition to the array (newer defs
         * take precedence). If not, create the definitions array and add it to the definitionsMap.
         */
        if (definitionsMap[typeName]) {
          definitionsMap[typeName].push(definition);
        } else {
          definitionsMap[typeName] = [definition];
        }
      } else if (isTypeExtensionNode(definition)) {
        const typeName = definition.name.value;

        /**
         * This definition is an extension of an OBJECT type defined in another service.
         * TODO: handle extensions of non-object types?
         */
        if (definition.kind === Kind.OBJECT_TYPE_EXTENSION) {
          if (!definition.fields) break;

          // create map of { fieldName: serviceName } for each field.
          const fields = definition.fields.reduce((prev, next) => {
            prev[next.name.value] = serviceName;
            return prev;
          }, Object.create(null));

          /**
           * If the type already exists in the serviceMap, add the extended fields. If not, create the object
           * and add the extensionFields, but don't add a serviceName. That will be added once that service
           * definition is processed.
           */
          if (serviceMap[typeName]) {
            serviceMap[typeName].extensionFields = {
              ...serviceMap[typeName].extensionFields,
              ...fields
            };
          } else {
            serviceMap[typeName] = { extensionFields: fields };
          }
        }

        /**
         * If an extension for this type already exists in the extensions map, push this extension to the
         * array (since a type can be extended by multiple services). If not, create the extensions array
         * and add it to the extensionsMap.
         */
        if (extensionsMap[typeName]) {
          extensionsMap[typeName].push(definition);
        } else {
          extensionsMap[typeName] = [definition];
        }
      }
    }
  }

  // After mapping over each service/type we can build the new schema from nothing.
  let schema = new GraphQLSchema({
    query: undefined,
    directives: undefined
  });

  // Extend the blank schema with the base type definitions
  schema = extendSchema(schema, {
    kind: Kind.DOCUMENT,
    definitions: Object.values(definitionsMap).flat()
  });

  // extend the base schema with service extensions
  schema = extendSchema(schema, {
    kind: Kind.DOCUMENT,
    definitions: Object.values(extensionsMap).flat()
  });

  /**
   * Extend each type in the GraphQLSchema we built with its `baseServiceName` (the owner of the base type)
   * For each field in those types, we do the same: add the name of the service that extended the base type
   * to add that field (the `extendingServiceName`)
   */
  for (const [
    typeName,
    { serviceName: baseServiceName, extensionFields }
  ] of Object.entries(serviceMap)) {
    const objectType = schema.getType(typeName) as GraphQLObjectType;
    objectType.serviceName = baseServiceName;
    for (const [fieldName, extendingServiceName] of Object.entries(
      extensionFields
    )) {
      objectType.getFields()[fieldName].serviceName = extendingServiceName;
    }
  }

  /**
   * At the end, we're left with a full GraphQLSchema that _also_ has `serviceName` fields for every type,
   * and every field that was extended. Fields that were _not_ extended (added on the base type by the owner),
   * there is no `serviceName`, and we should refer to the type's `serviceName`
   */
  return { schema, errors: undefined };
}

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

  it("handles collisions on type extensions as expected", () => {});

  it("handles collisions of base types expected (newest takes precedence)", () => {});

  it("lists, non-null, interfaces, unions, input, enum types", () => {});

  it("extending these -> lists, non-null, interfaces, unions, input, enums types", () => {});

  it("using arguments (are they preserved, etc.)", () => {});

  it("merges two+ schemas that only _extend_ query. should we ever be able to not define query", () => {});

  it("custom scalars / extending them", () => {});

  it("handles collisions on type extensions as expected", () => {});
});
