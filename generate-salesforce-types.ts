import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

// Initial list of objects to generate
const objectsToGenerate = [
  "Account",
  "Contact",
  "Opportunity",
  "AB_Member__c",
  "Org__c",
  "App__c",
  "Contract",
  "Invoice__c",
  "Invoice_Log__c",
  "Contract_Contact_Role_custom__c",
  "Contract_Org__c",
  "Contract_Product__c",
  "Lead",
  "Contract_Entry__c",
  "Amplitude_Scale_Program_License__c",
];

interface SalesforceConnectionConfig {
  endPoint: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  securityToken: string;
}

interface SalesforceAccessToken {
  access_token: string;
  instance_url: string;
  id: string;
  token_type: string;
  issued_at: string;
  signature: string;
}

interface Field {
  name: string;
  type: string;
  label: string;
  nillable: boolean;
  picklistValues: Array<{
    active: boolean;
    defaultValue: boolean;
    label: string;
    value: string;
  }>;
  referenceTo: string[];
  relationshipName?: string;
}

interface DescribeSObjectResult {
  name: string;
  fields: Field[];
}

class SalesforceConnection {
  private token: string | null = null;
  private instanceUrl: string | null = null;
  private readonly apiVersion: string = "58.0";
  private loginPromise: Promise<SalesforceAccessToken> | null = null;
  private config: SalesforceConnectionConfig;

  constructor(config: SalesforceConnectionConfig) {
    this.config = config;
  }

  private async fetch<T>(url: string, options: RequestInit): Promise<T> {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.json();
        if (error[0]?.errorCode === "INVALID_SESSION_ID") {
          console.log("Session expired, attempting to reconnect...");
          await this.login();
          // Retry the request with new token
          options.headers = {
            ...options.headers,
            Authorization: `Bearer ${this.token}`,
          };
          const retryResponse = await fetch(url, options);
          if (!retryResponse.ok) {
            throw new Error(`HTTP error! status: ${retryResponse.status}`);
          }
          return retryResponse.json();
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error("Fetch error:", error);
      throw error;
    }
  }

  async login(): Promise<SalesforceAccessToken> {
    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = (async () => {
      try {
        const response = await this.fetch<SalesforceAccessToken>(
          this.config.endPoint,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              grant_type: "password",
              client_id: this.config.clientId,
              client_secret: this.config.clientSecret,
              username: this.config.username,
              password: this.config.password + this.config.securityToken,
            }),
          }
        );

        this.token = response.access_token;
        this.instanceUrl = response.instance_url;

        console.log("Login successful. User ID: " + response.id);
        return response;
      } catch (error) {
        console.error("Login failed:", error);
        throw error;
      } finally {
        this.loginPromise = null;
      }
    })();

    return this.loginPromise;
  }

  async describe(objectName: string): Promise<DescribeSObjectResult> {
    if (!this.token || !this.instanceUrl) {
      throw new Error("Not logged in");
    }

    const url = `${this.instanceUrl}/services/data/v${this.apiVersion}/sobjects/${objectName}/describe`;
    return this.fetch<DescribeSObjectResult>(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });
  }

  async listAllObjects(): Promise<string[]> {
    if (!this.token || !this.instanceUrl) {
      throw new Error("Not logged in");
    }

    const url = `${this.instanceUrl}/services/data/v${this.apiVersion}/sobjects`;
    const result = await this.fetch<{ sobjects: Array<{ name: string }> }>(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return result.sobjects.map((obj) => obj.name);
  }
}

function generatePicklistType(field: Field): string {
  if (!field.picklistValues || field.picklistValues.length === 0) {
    return "string";
  }

  const activeValues = field.picklistValues
    .filter((value) => value.active)
    .map((value) => `'${value.value}'`);

  if (activeValues.length === 0) {
    return "string";
  }

  return activeValues.join(" | ");
}

function salesforceTypeToTypescript(
  field: Field,
  referencedObjects: Set<string>
): string {
  const type = field.type.toLowerCase();

  if (
    type === "reference" &&
    field.referenceTo &&
    field.referenceTo.length > 0
  ) {
    field.referenceTo.forEach((refObj) => referencedObjects.add(refObj));
    return field.referenceTo.length === 1
      ? field.referenceTo[0]
      : field.referenceTo.join(" | ");
  }

  if (type === "picklist") {
    return generatePicklistType(field);
  }

  if (type === "multipicklist") {
    const picklistType = generatePicklistType(field);
    return `Array<${picklistType}>`;
  }

  const typeMap: { [key: string]: string } = {
    string: "string",
    boolean: "boolean",
    int: "number",
    double: "number",
    currency: "number",
    percent: "number",
    date: "string", // YYYY-MM-DD
    datetime: "Date", // Full ISO datetime with timezone
    time: "string", // HH:mm:ss.SSS
    id: "string",
    phone: "string",
    email: "string",
    url: "string",
    textarea: "string",
    base64: "string",
    address: "string",
    location: "{ latitude: number; longitude: number }",
    anytype: "any",
  };

  return typeMap[type] || "any";
}

async function generateTypeForObject(
  sf: SalesforceConnection,
  objectName: string,
  referencedObjects: Set<string>
): Promise<string> {
  const meta = await sf.describe(objectName);
  let typeDefinition = `export interface ${objectName} {\n`;

  meta.fields.forEach((field) => {
    const tsType = salesforceTypeToTypescript(field, referencedObjects);

    if (field.type.toLowerCase() === "reference" && field.relationshipName) {
      typeDefinition += `  ${field.name}: string;\n`; // ID field
      typeDefinition += `  ${field.relationshipName}: ${tsType} | null;\n`; // Relationship field
    } else if (field.nillable) {
      typeDefinition += `  ${field.name}?: ${tsType};\n`;
    } else {
      typeDefinition += `  ${field.name}: ${tsType};\n`;
    }
  });

  typeDefinition += "}\n\n";
  return typeDefinition;
}

async function generateTypes(initialObjects: string[]) {
  const config: SalesforceConnectionConfig = {
    endPoint: process.env.SALESFORCE_END_POINT!,
    clientId: process.env.SALESFORCE_CLIENT_ID!,
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET!,
    username: process.env.SALESFORCE_USERNAME!,
    password: process.env.SALESFORCE_PASSWORD!,
    securityToken: process.env.SALESFORCE_SECURITY_TOKEN!,
  };

  const sf = new SalesforceConnection(config);
  await sf.login();

  const referencedObjects = new Set<string>(initialObjects);
  const processedObjects = new Set<string>();
  let allTypes = "";

  // Generate SalesforceObject type first
  const objectTypeDefinition = `export type SalesforceObject = ${initialObjects
    .map((obj) => `"${obj}"`)
    .join(" | ")};\n\n`;
  allTypes = objectTypeDefinition;

  while (referencedObjects.size > 0) {
    const objectsToProcess = Array.from(referencedObjects);
    referencedObjects.clear();

    for (const obj of objectsToProcess) {
      if (!processedObjects.has(obj)) {
        console.log(`Generating type for ${obj}`);
        allTypes +=
          (await generateTypeForObject(sf, obj, referencedObjects)) + "\n";
        processedObjects.add(obj);
      }
    }
  }

  const outputPath = path.join(__dirname, "salesforce-types.ts");
  fs.writeFileSync(outputPath, allTypes);
  console.log(`Types generated and saved to ${outputPath}`);
  console.log(`Total objects processed: ${processedObjects.size}`);
}

generateTypes(objectsToGenerate).catch(console.error);
