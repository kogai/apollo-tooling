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
  const definitionsMap: {
    [name: string]: TypeDefinitionNode[];
  } = Object.create(null);

  const extensionsMap: {
    [name: string]: TypeExtensionNode[];
  } = Object.create(null);

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

        if (serviceMap[typeName]) {
          serviceMap[typeName].serviceName = serviceName;
        } else {
          serviceMap[typeName] = {
            serviceName,
            extensionFields: Object.create(null)
          };
        }

        if (definitionsMap[typeName]) {
          // TODO: create duplicate type name warning
          definitionsMap[typeName].push(definition);
        } else {
          definitionsMap[typeName] = [definition];
        }
      } else if (isTypeExtensionNode(definition)) {
        const typeName = definition.name.value;

        if (definition.kind === Kind.OBJECT_TYPE_EXTENSION) {
          if (!definition.fields) break;
          const fields = definition.fields.reduce((prev, next) => {
            prev[next.name.value] = serviceName;
            return prev;
          }, Object.create(null));

          if (serviceMap[typeName]) {
            serviceMap[typeName].extensionFields = fields;
          } else {
            serviceMap[typeName] = { extensionFields: fields };
          }
        }

        if (extensionsMap[typeName]) {
          extensionsMap[typeName].push(definition);
        } else {
          extensionsMap[typeName] = [definition];
        }
      }
    }
  }

  let schema = new GraphQLSchema({
    query: undefined,
    directives: undefined
  });

  schema = extendSchema(schema, {
    kind: Kind.DOCUMENT,
    definitions: Object.values(definitionsMap).flat()
  });

  schema = extendSchema(schema, {
    kind: Kind.DOCUMENT,
    definitions: Object.values(extensionsMap).flat()
  });

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

  // FIXME
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
      name: "serviceB"
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
});
