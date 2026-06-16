import { gql } from "graphql-tag";

export const typeDefs = gql`
  enum PlantStatus {
    PLANTED
    SPROUTING
    FLOWERING
    FRUITING
    HARVESTED
    REMOVED
  }

  enum ObservationType {
    GENERAL
    WATERING
    FERTILIZING
    PEST
    HARVEST
  }

  type Gardener {
    id: ID!
    email: String!
    name: String!
    gardens: [Garden!]!
  }

  type Garden {
    id: ID!
    name: String!
    location: String
    gardener: Gardener!
    beds: [Bed!]!
    createdAt: String!
  }

  type Bed {
    id: ID!
    name: String!
    sizeSqFt: Float
    plants: [Plant!]!
  }

  # Data drawn from the An Incomplete Gardening Companion dataset.
  # Present when the plant's species field matches a known slug; null otherwise.
  type PlantCompanion {
    fullName: String
    commonNames: [String!]!
    plantType: [String!]!
    light: [String!]!
    hardinessZone: [String!]!
    maintenance: [String!]!
    resistance: [String!]!
    tags: [String!]!
    companionSlugs: [String!]!
    supportedBySlugs: [String!]!
  }

  type Plant {
    id: ID!
    name: String!
    species: String
    status: PlantStatus!
    plantedOn: String!
    observations: [Observation!]!
    companion: PlantCompanion
  }

  type Observation {
    id: ID!
    note: String!
    type: ObservationType!
    heightCm: Float
    createdAt: String!
  }

  type Query {
    me: Gardener
    gardens: [Garden!]!
    garden(id: ID!): Garden
    plant(id: ID!): Plant
  }

  # gardenerId removed — comes from the authenticated session
  input CreateGardenInput {
    name: String!
    location: String
  }

  input UpdateGardenInput {
    name: String
    location: String
  }

  input CreateBedInput {
    name: String!
    sizeSqFt: Float
    gardenId: ID!
  }

  input UpdateBedInput {
    name: String
    sizeSqFt: Float
  }

  input CreatePlantInput {
    name: String!
    species: String
    bedId: ID!
  }

  input UpdatePlantInput {
    name: String
    species: String
    status: PlantStatus
  }

  input AddObservationInput {
    plantId: ID!
    note: String!
    type: ObservationType
    heightCm: Float
  }

  input UpdateObservationInput {
    note: String
    type: ObservationType
    heightCm: Float
  }

  type Mutation {
    createGarden(input: CreateGardenInput!): Garden!
    updateGarden(id: ID!, input: UpdateGardenInput!): Garden!
    deleteGarden(id: ID!): Boolean!

    createBed(input: CreateBedInput!): Bed!
    updateBed(id: ID!, input: UpdateBedInput!): Bed!
    deleteBed(id: ID!): Boolean!

    createPlant(input: CreatePlantInput!): Plant!
    updatePlant(id: ID!, input: UpdatePlantInput!): Plant!
    deletePlant(id: ID!): Boolean!

    addObservation(input: AddObservationInput!): Observation!
    updateObservation(id: ID!, input: UpdateObservationInput!): Observation!
    deleteObservation(id: ID!): Boolean!

    updatePlantStatus(id: ID!, status: PlantStatus!): Plant!
  }
`;
