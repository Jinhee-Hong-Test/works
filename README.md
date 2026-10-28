# J WORKs

프로젝트·업무·로드맵·마감일을 관리하는 정적 웹앱입니다.

## GitHub Pages 배포

1. ZIP을 압축 해제합니다. ZIP 자체가 아닌 내부 파일을 저장소의 최상위에 올립니다.
2. GitHub 저장소의 `main` 브랜치에 `index.html`, `Base/`, `cloud/`, `scripts/`, `.github/workflows/pages.yml`, `.gitignore`, `README.md`를 올립니다.
   - macOS에서 숨김 파일/폴더는 `Command + Shift + .`로 표시합니다.
   - 업로드 후 `.github/workflows/pages.yml`이 저장소에 있는지 확인합니다.
3. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
4. **Actions → Deploy J WORKs to GitHub Pages → Run workflow**를 실행합니다.
5. 완료되면 Settings → Pages에 표시되는 사이트 주소로 접속합니다. 이후 main 브랜치에 변경사항을 올리면 자동 배포됩니다.

GitHub 계정/저장소 요금제에서 Pages를 지원해야 합니다.
공식 안내: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## 데이터 저장

기본 설정에서는 브라우저 localStorage에 저장합니다. 로그인과 자동 동기화를 사용하려면 [클라우드 설정 안내](cloud/SETUP.md)에 따라 Supabase를 연결하세요. 연결 후에는 동일 계정의 PC·아이폰에서 데이터를 공유합니다.
기존 로컬 파일의 데이터는 배포 주소로 자동 이전되지 않습니다. 기존 앱에서 JSON 백업 후 배포 사이트의 '불러오기'로 가져오세요.
클라우드를 연결하지 않은 경우 다른 기기에서는 같은 백업을 수동으로 불러와야 합니다.

개인 업무 백업 JSON은 저장소에 올리지 마세요. `.gitignore`는 Git으로 추가할 때 적용되며 GitHub 웹 업로드를 막아주지는 않습니다.
배포 스크립트는 HTML과 참조된 이미지·폰트만 복사합니다. 백업 JSON은 사이트에 포함하지 않습니다.
클라우드 연결 모드에서는 로그인해야 업무 화면을 사용할 수 있습니다. 웹페이지 코드 자체는 공개될 수 있으며, 업무 데이터는 서버의 RLS 규칙으로 보호됩니다.

## 로컬 배포 파일 확인

Python 3.9 이상에서:

```sh
python3 scripts/build_site.py
python3 -m http.server 8080 --directory _site
```

http://localhost:8080 에서 확인할 수 있습니다.

배포 버전은 첫 실행 시 프로젝트와 업무가 없는 빈 상태로 시작합니다. 샘플 데이터를 자동 생성하지 않습니다. 이미 해당 주소의 브라우저에 저장한 데이터는 그대로 불러옵니다.
