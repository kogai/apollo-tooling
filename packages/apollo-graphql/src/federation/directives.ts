import {
  GraphQLDirective,
  DirectiveLocation,
  GraphQLNonNull,
  GraphQLString
} from "graphql";

export const KeyDirective = new GraphQLDirective({
  name: "key",
  description: "",
  locations: [DirectiveLocation.OBJECT],
  args: {
    fields: {
      type: GraphQLNonNull(GraphQLString),
      description: ""
    }
  }
});

export const ExternalDirective = new GraphQLDirective({
  name: "external",
  description: "",
  locations: [DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION]
});

export const RequiresDirective = new GraphQLDirective({
  name: "requires",
  description: "",
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    fields: {
      type: GraphQLNonNull(GraphQLString),
      description: ""
    }
  }
});

export const ProvidesDirective = new GraphQLDirective({
  name: "requires",
  description: "",
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    fields: {
      type: GraphQLNonNull(GraphQLString),
      description: ""
    }
  }
});

export default [
  KeyDirective,
  ExternalDirective,
  RequiresDirective,
  ProvidesDirective
];
