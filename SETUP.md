# 레포 관리 (메인테이너용)

## 포함된 Salesforce 오브젝트

`salesforce-types.ts`에 다음 오브젝트의 타입이 정의돼 있습니다:

- `Account`, `Contact`, `Opportunity`, `Lead`
- `Contract`, `Contract_Product__c`, `Contract_Org__c`, `Contract_Entry__c`, `Contract_Contact_Role_custom__c`
- `Invoice__c`, `Invoice_Log__c`
- `Org__c`, `App__c`
- `AB_Member__c`
- `Amplitude_Scale_Program_License__c`
- 위 오브젝트들이 참조하는 오브젝트 (reference 필드 따라 자동 포함)

원본: `generate-salesforce-types.ts`의 `objectsToGenerate` 배열 (8~24줄)

---

## 타입 자동 생성 (GitHub Actions)

워크플로우 파일: `.github/workflows/generate-types.yml`

- **스케줄**: 매일 09:00 KST (00:00 UTC)
- **동작**: `generate-salesforce-types.ts` 실행 → Salesforce `describe` API로 각 오브젝트의 필드 메타데이터 조회 → reference 필드를 따라 참조 오브젝트 자동 발견 → TypeScript 인터페이스 생성 → `salesforce-types.ts` 커밋 & 푸시
- **수동 트리거**: [Actions 탭](https://github.com/ab180/salesforce-utils/actions) → "Generate Salesforce Types" → "Run workflow"

---

## 새 오브젝트 추가하기

1. `generate-salesforce-types.ts`의 `objectsToGenerate` 배열에 오브젝트 API 이름 추가
2. 커밋 & 푸시 (또는 다음 일일 실행 대기)
3. 참조 오브젝트는 `referenceTo` 필드를 따라 자동 발견되므로 루트 오브젝트만 추가하면 됨

---

## 레포 시크릿 설정

GitHub → 레포 Settings → Secrets and variables → Actions에 다음 6개 시크릿 등록:

| 시크릿 이름 | 설명 |
|---|---|
| `SALESFORCE_END_POINT` | OAuth 토큰 엔드포인트 URL |
| `SALESFORCE_CLIENT_ID` | Connected App 클라이언트 ID |
| `SALESFORCE_CLIENT_SECRET` | Connected App 클라이언트 시크릿 |
| `SALESFORCE_USERNAME` | Salesforce API 사용자 이름 |
| `SALESFORCE_PASSWORD` | API 사용자 비밀번호 |
| `SALESFORCE_SECURITY_TOKEN` | API 사용자 보안 토큰 |
