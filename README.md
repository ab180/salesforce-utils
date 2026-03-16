# salesforce-utils

ab180 Salesforce 연동용 타입 및 유틸 파일 모음.
`salesforce-types.ts`는 매일 09:00 KST에 Salesforce API로부터 자동 재생성됩니다.

---

## 빠른 시작

### 1. 파일 복사

```bash
curl -o salesforce-types.ts https://raw.githubusercontent.com/ab180/salesforce-utils/main/salesforce-types.ts
curl -o salesforce.ts https://raw.githubusercontent.com/ab180/salesforce-utils/main/salesforce.ts
```

### 2. 환경변수 설정

`.env`에 추가:

```
SALESFORCE_END_POINT=
SALESFORCE_CLIENT_ID=
SALESFORCE_CLIENT_SECRET=
SALESFORCE_USERNAME=
SALESFORCE_PASSWORD=
SALESFORCE_SECURITY_TOKEN=
```

### 3. 의존성 설치

`salesforce.ts`는 외부 패키지 없이 Node.js 내장 `fetch`만 사용합니다 (Node 18+).
환경변수 로딩에 `dotenv`를 쓴다면:

```bash
npm install dotenv
```

---

## 포함된 Salesforce 오브젝트

`salesforce-types.ts`에 다음 오브젝트의 타입이 정의돼 있습니다:

- `Account`, `Contact`, `Opportunity`, `Lead`
- `Contract`, `Contract_Product__c`, `Contract_Org__c`, `Contract_Entry__c`, `Contract_Contact_Role_custom__c`
- `Invoice__c`, `Invoice_Log__c`
- `Org__c`, `App__c`
- `AB_Member__c`
- `Amplitude_Scale_Program_License__c`
- 위 오브젝트들이 참조하는 오브젝트 (reference 필드 따라 자동 포함)

---

## 타입 업데이트

GitHub Actions가 매일 09:00 KST에 자동으로 `salesforce-types.ts`를 재생성하고 커밋합니다.
수동으로 트리거하려면 [Actions 탭](https://github.com/ab180/salesforce-utils/actions) → "Generate Salesforce Types" → "Run workflow".

---

## AI에게 전달하기

아래 코드 블록 전체를 복사해서 AI에게 붙여넣으세요.

```
이 프로젝트는 Salesforce와 연동합니다.
두 파일을 사용합니다: salesforce-types.ts, salesforce.ts

---

[salesforce-types.ts]
Salesforce API로부터 자동 생성된 TypeScript 타입 파일입니다.
다음 오브젝트의 인터페이스가 export됩니다:
Account, Contact, Opportunity, Lead,
Contract, Contract_Product__c, Contract_Org__c, Contract_Entry__c, Contract_Contact_Role_custom__c,
Invoice__c, Invoice_Log__c,
Org__c, App__c, AB_Member__c, Amplitude_Scale_Program_License__c
(+ 위 오브젝트들이 참조하는 오브젝트들)

또한 위 오브젝트명의 union type인 SalesforceObject도 export됩니다.

---

[salesforce.ts]
Salesforce 연결 및 쿼리 유틸입니다.
singleton 인스턴스 sf를 default export합니다.
환경변수(SALESFORCE_END_POINT, SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET,
SALESFORCE_USERNAME, SALESFORCE_PASSWORD, SALESFORCE_SECURITY_TOKEN)로 초기화됩니다.
세션은 2시간마다 자동 갱신됩니다.

주요 메서드:

sf.query<T>(soql: string)
  → Promise<{ totalSize: number; done: boolean; records: T[] }>
  SOQL 쿼리 실행. done이 false면 nextRecordsUrl이 있음.

sf.queryAll<T>(soql: string)
  → Promise<{ totalSize: number; done: boolean; records: T[] }>
  페이지네이션을 자동으로 처리해 전체 레코드를 반환.

sf.postRecord<T>(objectName: SalesforceObject, obj: Partial<T>, options?: { allowDuplicates?: boolean })
  → Promise<{ id: string; success: boolean; errors: Array<{ statusCode: string; message: string; fields: string[] }> }>
  단건 레코드 생성.

sf.postRecords<T>(objectName: SalesforceObject, objArray: Partial<T>[])
  → Promise<SalesforcePostResult[]>
  복수 레코드 생성. 200건 초과 시 자동 배치 처리.

sf.getRecordById<T>(objectName: SalesforceObject, id: string)
  → Promise<T | null>
  ID로 단건 조회. 없으면 null 반환.

sf.patchRecordById<T>(objectName: SalesforceObject, id: string, payload: Partial<T>)
  → Promise<number>
  ID로 단건 수정. HTTP 상태코드 반환 (성공 시 204).

sf.getAllFieldNames(objectName: SalesforceObject)
  → Promise<string[]>
  오브젝트의 모든 필드명 목록 반환.

sf.getOwnerIdBySlackID(slackId: string)
  → Promise<string | null>
  Slack ID로 Salesforce User ID 조회.

sf.getSlackIdBySalesforceUserId(id: string)
  → Promise<string | null>
  Salesforce User ID로 Slack ID 조회.

---

사용 예시:

import sf from './salesforce';
import { Account, Opportunity, Contract } from './salesforce-types';

// 조회
const accounts = await sf.queryAll<Account>('SELECT Id, Name FROM Account WHERE IsDeleted = false');

// 생성
const result = await sf.postRecord<Opportunity>('Opportunity', {
  Name: '신규 기회',
  StageName: 'Prospecting',
  CloseDate: '2025-12-31',
  AccountId: 'XXXXXXXXXXXX',
});

// 수정
await sf.patchRecordById<Contract>('Contract', contractId, { Status: 'Activated' });
```
