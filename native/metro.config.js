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

/*
 * 꾸러미는 이 폴더 것만 쓴다. 뿌리로 올라가면 웹 앱의 next·pg 가 딸려온다.
 *
 * **`npx expo-doctor` 가 이 두 줄을 실패로 찍는다** ("resolver.
 * disableHierarchicalLookup" mismatch. Expected false, got: true).
 * **고치지 마라 — 일부러 이렇게 둔 것이다.** 문지기가 하나 사라진다.
 *
 * 왜냐면: 앱은 `../../web/lib/*` 를 그대로 읽는다 (위 `watchFolders`).
 * 계층 탐색이 켜져 있으면 Metro 가 거기서 위로 올라가 `web/node_modules`
 * 를 찾아내는데, **거기에 `pg` 와 `next` 가 실제로 있다.** 누가 실수로
 * `db.ts` 를 `lib/pure.ts` 에 한 줄 더 적으면 `pg` 가 조용히 해결되고
 * **접속 문자열 다루는 코드가 폰 앱 번들에 실린다.** 꺼두면 그 자리에서
 * 시끄럽게 실패한다 — 조용히 새는 것보다 낫다.
 *
 * expo-doctor 는 이 검사를 끄는 설정을 제공하지 않는다 (설정으로 끌 수
 * 있는 건 `reactNativeDirectoryCheck` 와 `appConfigFieldsNotSyncedCheck`
 * 둘뿐이다). 그래서 **이 한 줄은 계속 실패로 남는다.** 나머지가 통과하는지만
 * 본다.
 */
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
