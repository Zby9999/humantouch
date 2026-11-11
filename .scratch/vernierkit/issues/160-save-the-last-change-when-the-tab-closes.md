# 160: 关掉标签页时，最后一下改动也存下来

**What to build:** 改动停 500ms 后才自动保存。退出编辑模式时会马上存一次（Shell 卸载时 flush），可关掉标签页、刷新、跳到别的页面时不会。设计师改完 500ms 内关掉标签页，这一下的改动就丢了。这是 114 线修 applying-bench.spec.ts:1527 时看到的，2026-11-12。

要做到：页面要离开时（关标签页、刷新、跳走），还没存的改动马上存下来，用浏览器在页面离开时也会送出的请求，比如 `fetch(..., { keepalive: true })` 或 `navigator.sendBeacon`。存下来的这一轮和平常自动保存的一样。没有未存的改动时，什么都不发。

用词以 GLOSSARY.md 为准。测试只跑相关的部分，整套由规划会话在 main 上按批跑。

**Blocked by:** None。发布前做（规划会话 2026-11-12 定：会丢设计师的改动，改动小）。

**Status:** done

- [x] 测试：改一个值，100ms 内关掉页面（或者导航走），再打开，这一下的改动还在，changeset.json 里有。改前失败。
- [x] 测试：没有改动时关掉页面，不发保存请求。
- [x] 退出编辑模式的保存照旧，不会存两次而出错。
- [x] `pnpm typecheck`、`pnpm test`、相关 e2e 过。

## Comments

### 做了什么（2026-11-12，114 线）

- **页面离开时存**（`Shell.tsx`）：编辑模式里听 `pagehide`（关标签页、刷新、跳走都会触发，进 bfcache 也会），还有等着存的（500ms 计时器还没到）就马上 `flush`，和退出编辑模式时的保存同一条路。没有等着存的，`flush` 直接返回，什么都不发。离开时存过以后计时器已经清掉，退出编辑模式（Shell 卸载）的那次 `flush` 也什么都不做，不会存两次。
- **怎么发**（`client/service.ts`、`round-watch.ts`）：用 `fetch(..., { keepalive: true })`，页面没了浏览器也会把它送完。`sendBeacon` 带不了本地服务要的令牌头，所以没用。离开时的保存不排在前一个保存后面，马上发：服务按到达顺序一个一个处理，前一个先到先处理。
- **压缩**（代定 1）：keepalive 请求一起最多带 64 KiB，示例页一轮已经 22 KB，一般项目的页面会超。所以离开时的保存先用 fflate 的 `gzipSync` 压一下（同步，`pagehide` 里来得及），带 `Content-Encoding: gzip`；本地服务（`src/service.ts` 的 `readBody`）看到这个头就解压。示例页的画布 55 KB 压完约 7 KB。压完还放不下（和正在发的离开保存加起来超 64 KiB）时，改成普通请求发，尽力而为。正在发的离开保存一有回应就把占用的额度还回来。
- **排着的旧保存不再发**（审查找到的）：平常的保存要等前一个有回应才发。排着还没发的保存，在它发出前又有了新的保存（平常的或离开时的），就不发了，只发最新的。这样从 bfcache 回到页面时，排着的旧保存不会在离开时的保存之后才到、把它盖掉。
- fflate 0.8.3（MIT）加成 devDependency，打进编辑层的包（`tsup.config.ts` 的 `noExternal`），锁文件里本来就有这个版本。`editor.dev.js` 大了 7.9 KB（gzip 后 4.1 KB）。这个文件是进编辑模式时才加载的，toggle 不受影响。

### 测试

- `test/leaving-save.browser.test.ts`（新，6 条）：
  - 离开时马上发，不等前一个保存的回应，压缩，带 keepalive。
  - 很大的画布压完能放进去。
  - 离开时丢掉整轮也一样发。
  - 和正在发的加起来超额度时改成普通请求，有回应后额度回来。
  - 平常的保存照旧一个接一个，排着的旧保存被新的取代就不发。
  - 离开以后排着的旧保存不再发。
- `e2e/tests/autosave.spec.ts`（新 4 条）：
  - 刷新、跳到 about:blank、关掉页面三种情况，在 500ms 内离开后，changeset.json 和 canvas.html 里都有这一下的改动。测试把页面里 500ms 的计时器拦掉，所以存下来的只能是离开时发的那一个。Playwright 看不到页面离开时发的请求，所以不靠数请求来判断。把 `pagehide` 去掉重跑，这条失败。
  - 没有等着存的时候离开，什么都没存：没改过就刷新，没有 changeset.json；改过而且已经存过，刷新后 changeset.json 的修改时间不变。

### 验证（新 main 合进分支后）

- `pnpm typecheck` 通过；`pnpm test` 1305 过、1 跳过，node 测试 132 过。
- `autosave.spec.ts`（project files 一组，`--repeat-each=3`）33 过、3 跳过（跳过的是只在写 fixture 时跑的那条）。
- `round.spec.ts`、`off-canvas-round.spec.ts`、`next-round.spec.ts`：36 过。
- `applying-bench.spec.ts` 里「promoted to the Card itself」×3：3 过（它靠退出编辑模式时的保存）。
- `off-canvas.spec.ts`、`made-off-canvas.spec.ts`：21 过。
- 没跑整套 e2e，按规划会话的轻量规矩，由规划会话在 main 上跑。
- 审查子代理（effort medium）找到 5 条：64 KiB 不够、排着的旧保存会盖掉离开时的保存、额度不释放、e2e 可能因为错的原因通过、「没发」的测试没有正向对照。都按上面改了；后两条改成看文件来判断，因为 Playwright 看不到页面离开时发的请求。

### 代定

1. 离开时的保存用 gzip 压（加 fflate 这个依赖，打进编辑层的包，`editor.dev.js` gzip 后多 4.1 KB），不只发 changeSet、也不另开接口。
2. 压完还超 64 KiB 时退回普通请求，尽力而为，不报错也不提示。
3. 排着还没发的保存，被更新的保存取代时就不发（平常编辑时也一样：连着几次保存只发最新的）。
4. 只听 `pagehide`，不听 `visibilitychange`（切到别的标签页不提前存）。

### 风险

1. 页面大到压完还超 64 KiB（大概是没压前 400 KB 以上的画布）时，离开时的保存是普通请求，页面没了浏览器可能取消它，这一下照样会丢。
2. 浏览器崩溃、强制退出时 `pagehide` 不触发，500ms 内的改动还是会丢。
3. 只在 Chromium 上测过（e2e 和 vitest 都是 Chromium）。Safari、Firefox 都支持 keepalive，带预检的 keepalive 也支持，但没实际跑。
4. 离开时的保存不等前一个：要是前一个保存已经发出、却比离开时的保存更晚到服务，就会盖掉它。在回环地址上前一个基本都先到。

**规划会话，2026-11-12**

线上合并到 main 4b7ecc1。规划会话看了改动范围：fflate 只作 devDependency，打进编辑层的包，切换按钮的包不变，服务端用 Node 自带的解压。

代定 1–4 都确认。
- 第 1 条：用 gzip，好过另开接口。
- 第 4 条：只听 pagehide。切换标签页不算离开，不提前保存。

风险 1–4 接受。
- 风险 4（晚到的旧保存盖掉离开时的保存）在本机回环地址上基本不会发生。真碰上了，再给保存加序号、让服务端丢掉旧的。

这张票的整套验证跟下一批 main 一起跑。
