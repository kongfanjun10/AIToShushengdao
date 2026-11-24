const fs = require("fs");
const path = require("path");
const pages = ["home", "listen", "capture", "reader", "vocab", "parent", "archive", "reward"];
const report = [];
pages.forEach((p) => {
  const jsPath = path.join("pages", p, p + ".js");
  const wxmlPath = path.join("pages", p, p + ".wxml");
  let js = fs.readFileSync(jsPath, "utf8");
  let wxml = fs.readFileSync(wxmlPath, "utf8");

  if (js.indexOf("utils/nav") === -1) {
    js = js.replace(/(const store = require\("\.\.\/\.\.\/utils\/store"\);)/, '$1\nconst nav = require("../../utils/nav");');
  }
  if (js.indexOf("navH: 44") === -1 && js.indexOf("statusBar: 20,") > -1) {
    js = js.replace("statusBar: 20,", "statusBar: 20,\n    navH: 44,\n    navRight: 0,");
  }
  js = js.replace(
    /(\s*)this\.setData\(\{ statusBar: app\.globalData\.statusBarHeight \}\);/,
    "$1this.setData(Object.assign({ statusBar: app.globalData.statusBarHeight }, nav.layout()));"
  );

  wxml = wxml.replace(/<view class="hd-inner">/g, '<view class="hd-inner" style="height:{{navH}}px;padding-right:{{navRight}}px">');
  wxml = wxml.replace(/padding-top:\{\{statusBar \+ 56\}\}px/g, "padding-top:{{statusBar + navH + 2}}px");

  fs.writeFileSync(jsPath, js);
  fs.writeFileSync(wxmlPath, wxml);
  report.push(p + " | js:" + (js.indexOf("nav.layout()") > -1) + " | hd:" + (wxml.indexOf("padding-right") > -1) + " | main:" + (wxml.indexOf("statusBar + navH") > -1));
});
console.log(report.join("\n"));
