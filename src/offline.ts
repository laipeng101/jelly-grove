export const offlineDownloadNote =
  import.meta.env.PROD && /^https?:$/.test(location.protocol)
    ? '<p class="settings-offline"><a href="./果冻果园.html" download>下载离线版</a> · 下载后用浏览器打开文件即可游玩。</p>'
    : "";
