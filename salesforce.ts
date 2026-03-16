import { AB_Member__c, SalesforceObject } from "./salesforce-types";

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

interface SalesforcePostResult {
  id: string;
  success: boolean;
  errors: Array<{
    statusCode: string;
    message: string;
    fields: string[];
  }>;
}

interface QueryResult<T> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

class SalesforceConnection {
  private token: string | null = null;
  private instanceUrl: string | null = null;
  private lastLoginTime: number | null = null;
  private readonly sessionDuration: number = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
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
        this.lastLoginTime = Date.now();

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

  private async ensureLoggedIn(): Promise<void> {
    if (
      !this.lastLoginTime ||
      !this.token ||
      Date.now() - this.lastLoginTime > this.sessionDuration
    ) {
      await this.login();
    }
  }

  async query<T extends object>(soql: string): Promise<QueryResult<T>> {
    await this.ensureLoggedIn();

    const url = `${this.instanceUrl}/services/data/v${
      this.apiVersion
    }/query/?q=${encodeURIComponent(soql)}`;

    return this.fetch<QueryResult<T>>(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });
  }

  async queryAll<T extends object>(soql: string): Promise<QueryResult<T>> {
    await this.ensureLoggedIn();

    let url = `${this.instanceUrl}/services/data/v${
      this.apiVersion
    }/queryAll/?q=${encodeURIComponent(soql)}`;
    let recordsAll: T[] = [];

    try {
      let currentResult = await this.fetch<QueryResult<T>>(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      recordsAll.push(...currentResult.records);

      while (!currentResult.done && currentResult.nextRecordsUrl) {
        url = `${this.instanceUrl}${currentResult.nextRecordsUrl}`;
        currentResult = await this.fetch<QueryResult<T>>(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
        });
        recordsAll.push(...currentResult.records);
      }

      return {
        ...currentResult,
        records: recordsAll,
      };
    } catch (error) {
      console.error("QueryAll failed:", error);
      throw error;
    }
  }

  async getOwnerIdBySlackID(slackId: string): Promise<string | null> {
    try {
      const result = await this.query<AB_Member__c>(`
        SELECT SFDC_User_ID__c
        FROM AB_Member__c
        WHERE Slack_ID__c = '${slackId}'
        LIMIT 1
      `);

      if (result.totalSize === 0 || !result.records[0].SFDC_User_ID__c) {
        console.log(`No Salesforce user found for Slack ID: ${slackId}`);
        return null;
      }

      return result.records[0].SFDC_User_ID__c;
    } catch (error) {
      console.error(`Error fetching Owner ID for Slack ID ${slackId}:`, error);
      throw error;
    }
  }

  async getSlackIdBySalesforceUserId(id: string): Promise<string | null> {
    try {
      const result = await this.query<AB_Member__c>(`
        SELECT Slack_ID__c
        FROM AB_Member__c
        WHERE SFDC_User_ID__c = '${id}'
        `);

      if (result.totalSize === 0 || !result.records[0].Slack_ID__c) {
        console.log(`No Salesforce user found for SFDC_User_ID : ${id}`);
        return null;
      }

      return result.records[0].Slack_ID__c;
    } catch (error) {
      console.error(
        `Error fetching Slack ID for Salesforce User ID ${id}:`,
        error
      );
      throw error;
    }
  }

  async postRecord<T extends object>(
    objectName: SalesforceObject,
    obj: Partial<T>,
    options?: {
      allowDuplicates?: boolean;
    }
  ): Promise<SalesforcePostResult> {
    await this.ensureLoggedIn();

    try {
      const url = `${this.instanceUrl}/services/data/v${this.apiVersion}/sobjects/${objectName}`;

      // 기본 헤더 설정
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      };

      // 중복 규칙 우회 옵션이 true인 경우 헤더 추가
      if (options?.allowDuplicates) {
        headers["Sforce-Duplicate-Rule-Header"] = "allowSave=true";
      }

      return this.fetch<SalesforcePostResult>(url, {
        method: "POST",
        headers,
        body: JSON.stringify(obj),
      });
    } catch (error) {
      console.error("Error posting record:", error);
      throw error;
    }
  }

  async postRecords<T extends object>(
    objectName: SalesforceObject,
    objArray: Partial<T>[]
  ): Promise<SalesforcePostResult[]> {
    await this.ensureLoggedIn();

    const records = objArray.map((obj) => ({
      ...obj,
      attributes: { type: objectName },
    }));

    const postBatch = async (batch: typeof records) => {
      const url = `${this.instanceUrl}/services/data/v${this.apiVersion}/composite/sobjects`;
      const payload = {
        allOrNone: false,
        records: batch,
      };

      return this.fetch<SalesforcePostResult[]>(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    };

    try {
      // 200개 이하인 경우 한 번에 처리
      if (records.length <= 200) {
        return await postBatch(records);
      }

      // 200개 초과인 경우 배치 처리
      const results: SalesforcePostResult[] = [];
      for (let i = 0; i < records.length; i += 200) {
        const batch = records.slice(i, i + 200);
        const batchResults = await postBatch(batch);
        results.push(...batchResults);
      }

      return results;
    } catch (error) {
      console.error("Error posting records:", error);
      throw error;
    }
  }

  async getRecordById<T extends object>(
    objectName: SalesforceObject,
    id: string
  ): Promise<T | null> {
    await this.ensureLoggedIn();

    try {
      const url = `${this.instanceUrl}/services/data/v${this.apiVersion}/sobjects/${objectName}/${id}`;
      return this.fetch<T>(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        console.log(`No record found for ${objectName} with ID: ${id}`);
        return null;
      }
      throw error;
    }
  }

  async patchRecordById<T extends object>(
    objectName: SalesforceObject,
    id: string,
    payload: Partial<T>
  ): Promise<number> {
    await this.ensureLoggedIn();

    try {
      const url = `${this.instanceUrl}/services/data/v${this.apiVersion}/sobjects/${objectName}/${id}`;
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      return response.status;
    } catch (error) {
      console.error(
        `Error updating record ${objectName} with ID ${id}:`,
        error
      );
      throw error;
    }
  }

  async getAllFieldNames(objectName: SalesforceObject): Promise<string[]> {
    await this.ensureLoggedIn();

    try {
      const url = `${this.instanceUrl}/services/data/v${this.apiVersion}/sobjects/${objectName}/describe`;
      const result = await this.fetch<{ fields: Array<{ name: string }> }>(
        url,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
        }
      );

      return result.fields.map((field) => field.name);
    } catch (error) {
      console.error(
        `Error getting field names for object ${objectName}:`,
        error
      );
      throw error;
    }
  }
}

// Create and export a singleton instance
const config: SalesforceConnectionConfig = {
  endPoint: process.env.SALESFORCE_END_POINT!,
  clientId: process.env.SALESFORCE_CLIENT_ID!,
  clientSecret: process.env.SALESFORCE_CLIENT_SECRET!,
  username: process.env.SALESFORCE_USERNAME!,
  password: process.env.SALESFORCE_PASSWORD!,
  securityToken: process.env.SALESFORCE_SECURITY_TOKEN!,
};

const sf = new SalesforceConnection(config);

export default sf;
