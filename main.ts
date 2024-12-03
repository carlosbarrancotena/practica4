import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { MongoClient, ObjectId } from "mongodb";
import "https://deno.land/x/dotenv/load.ts";

// Configuración de MongoDB
const MONGO_URL = Deno.env.get("MONGO_URL");
if (!MONGO_URL) {
  console.error("El link de MongoDB no funciona");
  Deno.exit(1);
}

const client = new MongoClient(MONGO_URL);
await client.connect();
console.log("Conectado a MongoDB");

const db = client.db("vehicles");
const vehiclesCollection = db.collection("vehiculos");
const partsCollection = db.collection("repuestos");

// Definición del esquema
const typeDefs = `#graphql
  type Vehicle {
    id: ID!
    name: String!
    manufacturer: String!
    year: Int!
    joke: String
    parts: [Part!]!
  }

  type Part {
    id: ID!
    name: String!
    price: Float!
    vehicleId: ID!
  }

  type Query {
    vehicles: [Vehicle!]!
    vehicle(id: ID!): Vehicle
    parts: [Part!]!
    vehiclesByManufacturer(manufacturer: String!): [Vehicle!]!
    partsByVehicle(vehicleId: ID!): [Part!]!
    vehiclesByYearRange(startYear: Int!, endYear: Int!): [Vehicle!]!
  }

  type Mutation {
    addVehicle(name: String!, manufacturer: String!, year: Int!): Vehicle!
    addPart(name: String!, price: Float!, vehicleId: ID!): Part!
    updateVehicle(id: ID!, name: String!, manufacturer: String!, year: Int!): Vehicle!
    deletePart(id: ID!): Part
  }
`;

// Resolvers
const resolvers = {
  Query: {
    vehicles: async () => {
      const vehicles = await vehiclesCollection.find().toArray();
      return Promise.all(
        vehicles.map(async (vehicle) => ({
          id: vehicle._id.toString(),
          ...vehicle,
          parts: await partsCollection.find({ vehicleId: vehicle._id.toString() }).toArray(),
          joke: await fetch("https://official-joke-api.appspot.com/random_joke")
            .then((res) => res.json())
            .then((data) => data.setup + " - " + data.punchline),
        }))
      );
    },
    vehicle: async (_: unknown, args: { id: string }) => {
      const vehicle = await vehiclesCollection.findOne({ _id: new ObjectId(args.id) });
      if (!vehicle) return null;

      const parts = await partsCollection.find({ vehicleId: args.id }).toArray();
      const joke = await fetch("https://official-joke-api.appspot.com/random_joke")
        .then((res) => res.json())
        .then((data) => data.setup + " - " + data.punchline);

      return {
        id: vehicle._id.toString(),
        ...vehicle,
        parts,
        joke,
      };
    },
    parts: async () => {
      const parts = await partsCollection.find().toArray();
      return parts.map((part) => ({
        id: part._id.toString(),
        ...part,
      }));
    },
    vehiclesByManufacturer: async (_: unknown, args: { manufacturer: string }) => {
      const vehicles = await vehiclesCollection.find({ manufacturer: args.manufacturer }).toArray();
      return vehicles.map((vehicle) => ({
        id: vehicle._id.toString(),
        ...vehicle,
      }));
    },
    partsByVehicle: async (_: unknown, args: { vehicleId: string }) => {
      const parts = await partsCollection.find({ vehicleId: args.vehicleId }).toArray();
      return parts.map((part) => ({
        id: part._id.toString(),
        ...part,
      }));
    },
    vehiclesByYearRange: async (_: unknown, args: { startYear: number; endYear: number }) => {
      const vehicles = await vehiclesCollection
        .find({ year: { $gte: args.startYear, $lte: args.endYear } })
        .toArray();
      return vehicles.map((vehicle) => ({
        id: vehicle._id.toString(),
        ...vehicle,
      }));
    },
  },
  Mutation: {
    addVehicle: async (_: unknown, args: { name: string; manufacturer: string; year: number }) => {
      const newVehicle = {
        name: args.name,
        manufacturer: args.manufacturer,
        year: args.year,
      };

      const result = await vehiclesCollection.insertOne(newVehicle);
      return {
        id: result.insertedId.toString(),
        ...newVehicle,
      };
    },
    addPart: async (_: unknown, args: { name: string; price: number; vehicleId: string }) => {
      const newPart = {
        name: args.name,
        price: args.price,
        vehicleId: args.vehicleId,
      };

      const result = await partsCollection.insertOne(newPart);
      return {
        id: result.insertedId.toString(),
        ...newPart,
      };
    },
    updateVehicle: async (_: unknown, args: { id: string; name: string; manufacturer: string; year: number }) => {
      const result = await vehiclesCollection.updateOne(
        { _id: new ObjectId(args.id) },
        { $set: { name: args.name, manufacturer: args.manufacturer, year: args.year } }
      );
      if (result.modifiedCount === 0) return null;

      return {
        id: args.id,
        name: args.name,
        manufacturer: args.manufacturer,
        year: args.year,
      };
    },
    deletePart: async (_: unknown, args: { id: string }) => {
      const part = await partsCollection.findOne({ _id: new ObjectId(args.id) });
      if (!part) return null;

      await partsCollection.deleteOne({ _id: new ObjectId(args.id) });
      return {
        id: part._id.toString(),
        ...part,
      };
    },
  },
};

// Configuración del servidor Apollo
const server = new ApolloServer({
  typeDefs,
  resolvers,
});

const { url } = await startStandaloneServer(server, {
  listen: { port: 4000 },
});

console.log(`🚀 Servidor listo en: ${url}`);
