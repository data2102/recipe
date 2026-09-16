/**
 * 순수 층을 **한 벌로** 쓴다.
 *
 * `web/lib/` 의 순수 파일(날짜 셈·정렬·모양)은 네이티브로 그대로 옮겨진다
 * — 그게 `tools/verify_layers.py` 가 매 푸시마다 재는 것이다. 복사해 오면
 * 그 검사를 통과하면서도 두 벌이 되어, 날짜 규칙 하나가 웹과 앱에서
 * 다르게 동작하기 시작한다. **복사하지 말고 그 파일을 그대로 읽는다.**
 *
 * Metro 는 기본적으로 프로젝트 폴더 밖을 안 본다. 저장소 뿌리를
 * 지켜보게 해서 `../web/lib/*` 를 번들에 넣는다.
 *
 * `web/lib/` 의 **아무 파일이나** 읽으면 안 된다 — `db.ts` 를 끌어오면
 * 접속 문자열이 앱에 실린다. 어느 파일이 순수인지는 `lib/pure.ts` 에
 * 한 군데로 모아두고, 거기 없는 것은 import 하지 않는다.
 */

const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.join(repoRoot, "web", "lib")];

// 꾸러미는 이 폴더 것만 쓴다. 뿌리로 올라가면 웹 앱의 next·pg 가 딸려온다.
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
