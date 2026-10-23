import { readFileSync } from "node:fs";

// Simplified-only characters and Simplified-only words. Kanji shared with
// Japanese (数, 体, 当, 内, 参 …) are deliberately absent: they are legitimate.
const ZH_CHARS =
  "这们专业东丝严个为丽举义乌乐乔习乡书买乱争亏亲亿仅从仓仪价众优伟伤伪侠债偿储兑党兰兴养兽册军农冲决况冻净准凉减凑几凤击划刘则创删别刹剂剧劝办动励劲劳势勋匀区医华协单卖卫厂厅历厉压厌厨厦县双发变叙叠叶号叹吓吕吗吨听启吴员呛呜咏咸响哑哗唤喷嘱团园围图圣场坏块坚坛坝坞坟垄垒垫墙壮声壳壶处备够头夹夺奖妆妇妈娱婴孙宁宝实宠审宪宫宽宾对寻导寿将尔尘尝尧尴届层属屿岁岗岛岭峡币帅师帐带帮幅广庄庆库应废开异弃张弹弥弯归录彻忆忧坏态怜总恋恳恶恼悦悬惊惧惨惩惯愤愿懒戏户扑执扩扫扬扰抛抢护报担拟拢拣拥拨择挂挠挡挤挥捞损换据掷揽搁搂搅携摄摆摇摊撑擅攒敌敛斋断无旧时显晋晒晓晕暂术机杀杂权杆杨杰极构枪枫柜柠标栈栋栏树样档桥桨桩梦检楼横欢欲歼殴毁毕毙气汇汉汤沟没沪泪泼泽洁洒洼浅浆浇浊测济浏浑浓涂润涧涨渊渐渔渗温湾湿溃滚满滤滥滨滩滞漏潜澜灭灯灵灾灿炉炼烁烂烛烟烦烧热焕焰爱爷牵牺犹独狭狮狱猎猪环现玺琐琼瑶璃瓮电画畅疗疮疯痒痪痴瘾皱盏盗盘监盖瞅瞒瞩矫码砖础硅硕确碍祸禄离秃积称秽稳穷窃窍窑窜窝窥竖竞笋笔笼筑筛筹签简箩箫篮篱类粮紧纠红约级纪纬纯纱纲纳纵纷纸纹纺纽线练组细织终绍经绑绒结绕绘给络绝绞统绣继绩绪续绳维绵综绿缀缓编缘缚缝缠缩缴网罗罚罢羡翘耸耻聋职联聪肃肠肤肾肿胀胁胆胜胶脉脏脑脓脱脸腊腻腾舰舱艰艳艺节芜苇苍苏苔苗茧茫荡荣荤药莱莲获莹菊萧萨葱蒋蓝蔷蔼蕴衅衔补袄装见观规视觉览触誉计订认讨让训议讯记讲讳讶讼讽设访诀证评识诈诉诊译词试诗诚话诞询该详诧诫诬语误诱说诵请诸诺读课谁调谅谈谊谋谎谐谜谢谣谤谦谨谬谱谴负贡财责贤败账货质贩贪贫贬购贮贰贱贷贸费贺贼贾贿赁赃资赋赌赎赏赐赔赖赚赛赞赠赢赤赵赶趋趟躯车轧轨轩转轮软轰轴轻载轿较辅辆辈辉辑输辐辖辗辞辩边辽达迁过运还进远违连迟适选递逻遗遥邓郑邻释鉴钉钓钙钝钞钟钠钢钥钦钩钮钱钳钻铁铃铜铝铠铐锐错锚锡锣锤锥锦锯镀镁镇镑镖镜镰长闪闭问闯闲间闷闹闻阁阅阎阔阙队阳阴阵阶际陆陈陕陨险随隐隶难雏雾霉静韦韩页顶项顺须顽顾顿颁预颅领颇颈颊频颗题颜额颠颤风飘飞饭饮饰饱饲饶饼饿馆馈馋馒马驭驰驱驳驴驶驻驼驾驿骂骄验骏骑骗骚骤骨髅鱼鲜鲤鲨鲸鳄鳍鳖鳗鸟鸡鸣鸥鸭鸯鸳鸽鸿鹅鹊鹏鹤鹦鹰麦齐龄龙龟";
const ZH_WORDS = ["站内", "页面", "链接地址", "下载站", "国内网络", "实时", "在线"];
// Kanji that are valid Japanese but sit in the Simplified-only set above.
// 幅 belongs here: 帯域幅 is the ordinary word for bandwidth.
const JA_OK = new Set([...("横断残欧参献幅")]);
const zhChars = new Set([...ZH_CHARS]);

const flat = (o, p = "") =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]],
  );

let found = 0;
for (const locale of ["ja", "de", "fr", "es", "pt"]) {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  for (const [key, value] of flat(messages)) {
    if (typeof value !== "string") continue;
    const hits = [...value]
      .filter((char) => zhChars.has(char) && !(locale === "ja" && JA_OK.has(char)))
      .join("");
    const words = ZH_WORDS.filter((word) => value.includes(word));
    if (hits || words.length) {
      found += 1;
      console.log(`${locale} ${key} → ${[hits, ...words].filter(Boolean).join(",")} :: ${value.slice(0, 90)}`);
    }
  }
}
console.log(found === 0 ? "OK: no Chinese bleed-over in non-zh locales" : `FOUND ${found}`);
process.exit(found === 0 ? 0 : 1);
