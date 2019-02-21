import "apollo-env";
import {
  GraphQLSchema,
  extendSchema,
  Kind,
  DocumentNode,
  TypeDefinitionNode,
  TypeExtensionNode,
  isTypeDefinitionNode,
  isTypeExtensionNode,
  GraphQLError,
  isEnumType,
  GraphQLNamedType,
  isObjectType,
  isInputObjectType,
  isInterfaceType,
  isUnionType,
  isScalarType
} from "graphql";
import { SDLValidationRule } from "graphql/validation/ValidationContext";
import { validateSDL } from "graphql/validation/validate";

import federationDirectives from "./directives";

declare module "graphql/validation/validate" {
  function validateSDL(
    documentAST: DocumentNode,
    schemaToExtend?: GraphQLSchema | null,
    rules?: ReadonlyArray<SDLValidationRule>
  ): GraphQLError[];
}

declare module "graphql/type/definition" {
  interface GraphQLObjectType {
    serviceName?: string;
  }

  interface GraphQLEnumType {
    serviceName?: string;
  }

  interface GraphQLScalarType {
    serviceName?: string;
  }

  interface GraphQLInterfaceType {
    serviceName?: string;
  }

  interface GraphQLUnionType {
    serviceName?: string;
  }

  interface GraphQLInputObjectType {
    serviceName?: string;
  }

  interface GraphQLInputField {
    serviceName?: string;
  }

  interface GraphQLField<TSource, TContext> {
    serviceName?: string;
  }

  interface GraphQLEnumValue {
    serviceName?: string;
  }
}

interface ServiceDefinition {
  typeDefs: DocumentNode;
  name: string;
}

export function composeServices(services: ServiceDefinition[]) {
  let errors: GraphQLError[] | undefined = undefined;
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
      if (
        (definition.kind === Kind.OBJECT_TYPE_DEFINITION ||
          definition.kind === Kind.OBJECT_TYPE_EXTENSION) &&
        definition.fields
      ) {
        definition.fields = definition.fields.filter(field => {
          return !(
            field.directives &&
            field.directives.some(
              directive => directive.name.value === "external"
            )
          );
        });
      }
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
        if (
          definition.kind === Kind.OBJECT_TYPE_EXTENSION ||
          definition.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION
        ) {
          if (!definition.fields) break;

          // XXX fix types
          // create map of { fieldName: serviceName } for each field.
          const fields = (definition.fields as any[]).reduce((prev, next) => {
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

        if (definition.kind === Kind.ENUM_TYPE_EXTENSION) {
          if (!definition.values) break;

          const values = definition.values.reduce((prev, next) => {
            prev[next.name.value] = serviceName;
            return prev;
          }, Object.create(null));

          if (serviceMap[typeName]) {
            serviceMap[typeName].extensionFields = {
              ...serviceMap[typeName].extensionFields,
              ...values
            };
          } else {
            serviceMap[typeName] = { extensionFields: values };
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

  /**
   * what if an extended type doesn't have a base type?
   * - Check each of the extensions, and see if there's a corresponding definition
   * - if so, do nothing. If not, create an empty definition with `null` as the serviceName
   */
  for (const [name, extensionNode] of Object.entries(extensionsMap)) {
    if (!definitionsMap[name]) {
      definitionsMap[name] = [
        {
          kind: Kind.OBJECT_TYPE_DEFINITION,
          name: { kind: Kind.NAME, value: name },
          fields: []
        }
      ];

      // XXX types might be off if no TS error is happening here
      // ideally, the serviceName would be the first extending service, but there's not a reliable way
      // to trace the extensionNode back to a service.
      serviceMap[name].serviceName = null;
    }
  }

  // After mapping over each service/type we can build the new schema from nothing.
  let schema = new GraphQLSchema({
    query: undefined,
    directives: federationDirectives
  });

  // Extend the blank schema with the base type definitions

  const definitionsDocument = {
    kind: Kind.DOCUMENT,
    definitions: Object.values(definitionsMap).flat()
  };
  // throw new Error(JSON.stringify(definitionsDocument));

  errors = validateSDL(definitionsDocument, schema);

  schema = extendSchema(schema, definitionsDocument, { assumeValidSDL: true });

  const extensionsDocument = {
    kind: Kind.DOCUMENT,
    definitions: Object.values(extensionsMap).flat()
  };

  errors.push(...validateSDL(extensionsDocument, schema));

  schema = extendSchema(schema, extensionsDocument, { assumeValidSDL: true });

  /**
   * Extend each type in the GraphQLSchema we built with its `baseServiceName` (the owner of the base type)
   * For each field in those types, we do the same: add the name of the service that extended the base type
   * to add that field (the `extendingServiceName`)
   */
  for (const [
    typeName,
    { serviceName: baseServiceName, extensionFields }
  ] of Object.entries(serviceMap)) {
    // A named type can be any one of:
    // ObjectType, InputObjectType, EnumType, UnionType, InterfaceType, ScalarType
    const namedType = schema.getType(typeName) as GraphQLNamedType;
    namedType.serviceName = baseServiceName;

    if (isObjectType(namedType)) {
      const keyDirectives =
        namedType.astNode &&
        namedType.astNode.directives &&
        namedType.astNode.directives.filter(
          directive => directive.name.value === "key"
        );
      namedType.keys = keyDirectives
        ? keyDirectives
            .map(keyDirective =>
              keyDirective.arguments
                ? keyDirective.arguments[0].value.value
                : null
            )
            .filter(Boolean)
        : [];
    }

    for (const [fieldName, extendingServiceName] of Object.entries(
      extensionFields
    )) {
      if (
        isObjectType(namedType) ||
        isInputObjectType(namedType) ||
        isInterfaceType(namedType)
      ) {
        const field = namedType.getFields()[fieldName];
        field.serviceName = extendingServiceName;

        const requiresDirective =
          field.astNode &&
          field.astNode.directives.find(
            directive => directive.name.value === "requires"
          );

        if (requiresDirective && requiresDirective.arguments) {
          field.requires = requiresDirective.arguments[0].value.value;
        }
      }

      // TODO: We want to throw warnings for this
      if (isEnumType(namedType)) {
        const enumValue = namedType
          .getValues()
          .find(value => value.name === fieldName);

        if (enumValue) {
          enumValue.serviceName = extendingServiceName;
        }
      }

      if (isUnionType(namedType)) {
        // TODO
        // can you extend a union type?
      }

      if (isScalarType(namedType)) {
        // TODO
      }
    }
  }

  /**
   * At the end, we're left with a full GraphQLSchema that _also_ has `serviceName` fields for every type,
   * and every field that was extended. Fields that were _not_ extended (added on the base type by the owner),
   * there is no `serviceName`, and we should refer to the type's `serviceName`
   */
  return { schema, errors };
}
