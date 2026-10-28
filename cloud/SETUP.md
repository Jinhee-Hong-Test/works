# WORKs 클라우드 설정 — Edge Function 방식

현재 파일은 준비된 코드입니다. 아래 서버 설정과 사이트 배포를 완료해야 동기화됩니다.
기존 Supabase 프로젝트를 사용해도 됩니다. 로그인은 현재 이메일/비밀번호이며 네이버 로그인은 아직 구현되지 않았습니다.

## 1. 테이블 만들기
1. Supabase의 J Works 프로젝트 → SQL Editor → New query를 엽니다.
2. 이 폴더의 schema.sql 전체를 복사해 붙여넣고 Run을 누릅니다.
3. 성공 후 Table Editor를 새로고침하면 pworks_documents, pworks_allowed_users가 보입니다.
기존 문서는 삭제하지 않습니다. 이전 직접 API 권한과 함수는 제거됩니다.

## 2. 본인 로그인 계정 등록
1. Authentication → Users에서 본인 이메일/비밀번호 계정을 만들고 이메일 확인을 완료합니다.
2. 해당 사용자의 User UID(UUID)를 복사합니다. 프로젝트 ID와 다릅니다.
3. SQL Editor 새 쿼리에서 아래 UUID를 바꿔 실행합니다.

```sql
insert into public.pworks_allowed_users(user_id)
values ('복사한 사용자 UUID') on conflict do nothing;
```

개인용이므로 Auth 설정의 공개 회원가입은 비활성화합니다.

## 3. 서버 함수 배포
1. Edge Functions → Deploy a new function → Via Editor를 선택합니다.
2. 이름을 `pworks-sync`로 지정합니다.
3. `supabase/functions/pworks-sync/index.ts` 전체 내용을 편집기에 붙여넣습니다.
4. Edge Functions Secrets에서 `ALLOWED_ORIGINS`를 추가합니다. 값은 배포 사이트의 origin입니다.
   예: `https://내아이디.github.io` (저장소 경로나 마지막 / 없이). 여러 주소는 쉼표로 구분합니다.
5. 함수를 배포합니다. 사용자 JWT를 검증하는 기본 설정을 유지합니다.

SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_DB_URL은 Supabase의 서버 환경 변수를 사용합니다.
DB 연결 오류가 있으면 함수 로그와 서버 연결 설정을 점검합니다. DB 비밀번호나 secret key를 HTML, config.js, GitHub에 넣지 마세요.
함수는 Auth 서버에서 검증한 사용자 UUID로만 DB를 조회하며, 허용 목록에 있는 계정만 접근할 수 있습니다.
브라우저에서는 테이블이나 RPC로 직접 접근하지 않습니다. 서버는 직접 Postgres 연결을 사용합니다.

## 4. 웹사이트 업데이트
1. 최신 J-WORKs-GitHub-Pages.zip 내용으로 GitHub 저장소를 업데이트하고 배포합니다.
2. PC에서 배포된 HTTPS 사이트를 열고 본인 계정으로 로그인합니다.
3. 기존 로컬 앱의 JSON 백업을 배포 사이트의 불러오기로 가져옵니다.
4. 아이폰에서 같은 주소와 같은 계정으로 로그인합니다.

cloud/config.js에는 기존 프로젝트 URL과 공개키가 설정되어 있습니다.
file:// 로컬 파일에서는 클라우드 로그인이 동작하지 않습니다.

## 확인과 복구
- PC에서 업무를 저장한 뒤 아이폰에 반영되는지, 반대 방향도 확인합니다.
- 로그인하지 않았거나 허용하지 않은 계정의 요청은 거부되어야 합니다.
- 화면이 열려 있고 편집 중이 아닐 때 약 3초마다 조회합니다. Realtime은 사용하지 않습니다.
- 동시에 수정하면 충돌 안내가 나옵니다. 미동기화 JSON을 백업하고 서버 데이터를 불러온 뒤 필요한 변경을 다시 입력합니다.
- 로그인 상태 유지를 선택하면 세션을 해당 기기의 브라우저에 보관하여 재실행 시 복원합니다. 선택하지 않으면 탭에만 저장합니다. 비밀번호는 저장하지 않으며 로그아웃 시 두 저장소의 세션을 삭제합니다. 서버에서 세션이 만료·취소되거나 브라우저 데이터를 삭제하면 다시 로그인해야 합니다.
- 업무, 프로젝트, 일정, 메모, 미팅 및 업무시간 설정은 작업공간 데이터로 함께 저장합니다.
- Storage와 이미지 변환은 사용하지 않습니다. JSON 백업은 별도로 보관하세요.
- 로컬 자동 테스트는 실제 DB·Auth·두 기기 동기화 검증을 대신하지 않습니다.

공식 문서:
- https://supabase.com/docs/guides/functions/quickstart-dashboard
- https://supabase.com/docs/guides/functions/connect-to-postgres
- https://supabase.com/docs/guides/functions/secrets
