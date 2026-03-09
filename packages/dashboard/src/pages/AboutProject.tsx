export default function AboutProject() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">

      {/* Why */}
      <section>
        <h2 className="text-2xl font-bold mb-4">關於這個 POC</h2>
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-3 text-slate-300 leading-relaxed">
          <p>
            聽到醫療大樓設備整合這個方向後，我花了一個週末做了一個原型，想驗證三件事：
          </p>
          <ol className="list-decimal list-inside space-y-2 pl-2">
            <li><span className="text-white font-medium">技術上走不走得通</span> — 幾百個不同廠牌、不同規格的設備，有沒有辦法整合進同一個平台即時監控？</li>
            <li><span className="text-white font-medium">難度在哪裡</span> — 真正的挑戰是什麼？哪些我能處理，哪些需要外部支援？</li>
            <li><span className="text-white font-medium">我自己有沒有動力</span> — 比起看文件評估，動手做一次最誠實</li>
          </ol>
          <p className="text-slate-400 text-sm pt-2">
            這不是成品，是一個「用來聊天的原型」。
          </p>
        </div>
      </section>

      {/* Who am I */}
      <section>
        <h2 className="text-xl font-bold mb-4">我是誰（30 秒版）</h2>
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-3 text-slate-300 leading-relaxed">
          <ul className="space-y-2">
            <li>八年軟體開發經驗，從工程師做到帶團隊，做的是<span className="text-white font-medium">企業級系統整合</span></li>
            <li>擅長的事：把散落在不同地方的資料收進來、整理乾淨、即時呈現、自動告警</li>
            <li>離開的原因：想做從零建構產品的事，而不是在成熟系統上做增量修補</li>
          </ul>
          <p className="text-slate-400 text-sm pt-2">
            醫療和 IoT 不是我的本行，但我做了八年軟體開發，核心的工程問題是相通的。<br />
            這個 POC 是我的誠意，也是我確認自己能力邊界的方式。
          </p>
        </div>
      </section>

      {/* What the POC does */}
      <section>
        <h2 className="text-xl font-bold mb-4">POC 做了什麼</h2>
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-4 text-slate-300 leading-relaxed">
          <p>我模擬了一棟醫療大樓的場景：</p>
          <ul className="space-y-2">
            <li><span className="text-white font-medium">474 台設備</span>同時運作（空調、電力、消防、電梯、照明、感測器等 12 種設備類型）</li>
            <li>這些設備用 <span className="text-white font-medium">5 種不同的通訊協定</span>傳送資料（對應真實場景中不同廠牌的設備）</li>
            <li>所有資料<span className="text-white font-medium">即時匯入同一個平台</span>，統一顯示在您現在看到的監控儀表板上</li>
            <li>系統能<span className="text-white font-medium">自動偵測異常</span>並發出告警（例如某台設備讀數超出正常範圍、連鎖故障追蹤）</li>
          </ul>

          <p className="text-sm text-slate-400 mt-4 mb-2">模擬的協定與對應廠牌：</p>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400 border-b border-slate-600">
                <tr>
                  <th className="text-left p-2">通訊協定</th>
                  <th className="text-left p-2">對應廠牌（模擬）</th>
                  <th className="text-left p-2">設備類型</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                <tr className="border-b border-slate-700">
                  <td className="p-2 font-medium text-white">BACnet IP</td>
                  <td className="p-2">大金、飛利浦、Honeywell</td>
                  <td className="p-2 text-slate-400">空調主機、送風機、照明、溫溼度感測器</td>
                </tr>
                <tr className="border-b border-slate-700">
                  <td className="p-2 font-medium text-white">Modbus TCP</td>
                  <td className="p-2">日立、台達、ABB、施耐德、Siemens、松下、Cummins、Caterpillar</td>
                  <td className="p-2 text-slate-400">空調、變頻器、電力盤、UPS、發電機、水表</td>
                </tr>
                <tr className="border-b border-slate-700">
                  <td className="p-2 font-medium text-white">OPC UA</td>
                  <td className="p-2">三菱、施耐德、西門子、日立</td>
                  <td className="p-2 text-slate-400">送風機、變頻器、電力盤、電梯</td>
                </tr>
                <tr className="border-b border-slate-700">
                  <td className="p-2 font-medium text-white">MQTT</td>
                  <td className="p-2">川源、歐司朗、研華、大同</td>
                  <td className="p-2 text-slate-400">消防泵浦、照明、溫溼度 / 空氣品質感測器、水表</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium text-white">RESTful API</td>
                  <td className="p-2">APC、Honeywell</td>
                  <td className="p-2 text-slate-400">UPS、空氣品質感測器</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-slate-400 text-sm pt-3">
            用白話說：我驗證了「把一整棟大樓的設備資訊收攏到一個畫面上，並且讓系統自己抓問題」這件事，技術上是做得到的。
          </p>
        </div>
      </section>

      {/* Assessment - What works */}
      <section>
        <h2 className="text-xl font-bold mb-4">我的評估結論</h2>

        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-4">
          <h3 className="text-lg font-semibold mb-3 text-green-400">做得到的部分</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400 border-b border-slate-600">
                <tr>
                  <th className="text-left p-2">項目</th>
                  <th className="text-left p-2">說明</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                <tr className="border-b border-slate-700">
                  <td className="p-2 font-medium text-white whitespace-nowrap">異質設備整合</td>
                  <td className="p-2">不同廠牌、不同協定的設備，可以透過中間轉譯層統一處理，下游不需要逐一對接</td>
                </tr>
                <tr className="border-b border-slate-700">
                  <td className="p-2 font-medium text-white whitespace-nowrap">即時監控</td>
                  <td className="p-2">幾百台設備的即時資料串流，在合理的架構下效能不是問題</td>
                </tr>
                <tr className="border-b border-slate-700">
                  <td className="p-2 font-medium text-white whitespace-nowrap">自動異常偵測</td>
                  <td className="p-2">基本的告警規則（超出閾值、異常變化率）已經能抓到大部分明顯問題</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium text-white whitespace-nowrap">一人啟動</td>
                  <td className="p-2">初期由一個工程師建立核心架構是可行的，前提是有清楚的產品範圍定義</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Risk table - core of the document */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-3 text-amber-400">需要進一步釐清的風險</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400 border-b border-slate-600">
                <tr>
                  <th className="text-left p-2">風險</th>
                  <th className="text-left p-2">影響</th>
                  <th className="text-left p-2 bg-cyan-900/40 border-l-2 border-cyan-400 text-cyan-300 font-bold text-base">我需要的支援</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                <tr className="border-b border-slate-700">
                  <td className="p-2 font-medium text-white align-top">真實設備的對接複雜度遠高於模擬</td>
                  <td className="p-2 align-top">每個廠牌的設備可能有各自的通訊規格、版本差異、斷線行為，模擬環境抓不到這些問題</td>
                  <td className="p-2 align-top bg-cyan-900/20 border-l-2 border-cyan-400">
                    <span className="text-cyan-300 font-medium">實體設備或 demo 機</span>供測試；<span className="text-cyan-300 font-medium">設備廠商的技術窗口</span>協助對接
                  </td>
                </tr>
                <tr className="border-b border-slate-700">
                  <td className="p-2 font-medium text-white align-top">醫療場域的特殊需求不明</td>
                  <td className="p-2 align-top">醫院跟一般商辦大樓不同，可能有法規、資安、設備優先序等特殊要求，會直接影響系統設計</td>
                  <td className="p-2 align-top bg-cyan-900/20 border-l-2 border-cyan-400">
                    <span className="text-cyan-300 font-medium">醫院端的對接窗口</span>，了解實際使用場景與限制條件
                  </td>
                </tr>
                <tr className="border-b border-slate-700">
                  <td className="p-2 font-medium text-white align-top">建築自動化領域知識不足</td>
                  <td className="p-2 align-top">BMS（大樓自動化系統）有自己的產業標準和整合慣例，我還不夠熟</td>
                  <td className="p-2 align-top bg-cyan-900/20 border-l-2 border-cyan-400">
                    <span className="text-cyan-300 font-medium">產業顧問或外部專家</span>提供領域知識，避免走彎路
                  </td>
                </tr>
                <tr className="border-b border-slate-700">
                  <td className="p-2 font-medium text-white align-top">現場環境變數多</td>
                  <td className="p-2 align-top">大樓的網路環境、設備佈線、機房條件都會影響系統架構，坐在辦公室設計不夠</td>
                  <td className="p-2 align-top bg-cyan-900/20 border-l-2 border-cyan-400">
                    <span className="text-cyan-300 font-medium">至少一個實際場域</span>可以做 pilot 測試
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-medium text-white align-top">單人開發的持續性風險</td>
                  <td className="p-2 align-top">一個人可以啟動，但長期獨自開發會有品質下降和瓶頸累積的問題</td>
                  <td className="p-2 align-top bg-cyan-900/20 border-l-2 border-cyan-400">
                    <span className="text-cyan-300 font-medium">明確的團隊擴編時程</span>，讓我知道隊友什麼時候來
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Suggested first step */}
      <section>
        <h2 className="text-xl font-bold mb-4">如果決定啟動，我建議的第一步</h2>
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 space-y-4 text-slate-300 leading-relaxed">
          <p>不是馬上開始寫產品，而是先花 <span className="text-white font-medium">2-3 個月做技術驗證</span>：</p>
          <ol className="list-decimal list-inside space-y-3 pl-2">
            <li><span className="text-white font-medium">拿到 1-2 種真實設備</span>，驗證實際對接的複雜度（模擬跟實際的落差通常在這裡）</li>
            <li><span className="text-white font-medium">跑一次最小場景的 pilot</span>，例如一層樓、十幾台設備，端到端跑通</li>
            <li><span className="text-white font-medium">在這個過程中釐清產品範圍</span> — 哪些功能是客戶真正需要的，哪些可以之後再做</li>
          </ol>
          <p className="text-slate-400 text-sm pt-2">
            這三個月結束後，我們會有一個務實的判斷基礎：這件事該怎麼做、要投入多少資源、時程怎麼抓。
          </p>
        </div>
      </section>

      {/* Discussion questions */}
      <section>
        <h2 className="text-xl font-bold mb-4">我想請教的問題</h2>

        <div className="space-y-6">
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-base font-semibold mb-4 text-cyan-400">關於這個產品的起點</h3>
            <ol className="space-y-4 text-slate-300">
              <li className="flex gap-3">
                <span className="text-cyan-500 font-mono text-sm mt-0.5 font-medium">1.</span>
                <span>這個方向是怎麼來的？是已經有客戶在問，還是公司看到的市場機會？</span>
              </li>
              <li className="flex gap-3">
                <span className="text-cyan-500 font-mono text-sm mt-0.5 font-medium">2.</span>
                <span>公司對這個產品的定位是什麼？獨立事業線、既有業務的延伸、還是先探索看看？</span>
              </li>
              <li className="flex gap-3">
                <span className="text-cyan-500 font-mono text-sm mt-0.5 font-medium">3.</span>
                <span>有沒有初步接觸過的目標客戶或合作醫院？</span>
              </li>
            </ol>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-base font-semibold mb-4 text-cyan-400">關於我會需要的支援</h3>
            <ol start={4} className="space-y-4 text-slate-300">
              <li className="flex gap-3">
                <span className="text-cyan-500 font-mono text-sm mt-0.5 font-medium">4.</span>
                <span>如果我需要 demo 設備或跟設備廠商對接，公司這邊有管道嗎？</span>
              </li>
              <li className="flex gap-3">
                <span className="text-cyan-500 font-mono text-sm mt-0.5 font-medium">5.</span>
                <span>有沒有建築自動化或醫療設備領域的顧問資源可以引入？</span>
              </li>
              <li className="flex gap-3">
                <span className="text-cyan-500 font-mono text-sm mt-0.5 font-medium">6.</span>
                <span>前期的預算空間大概是什麼量級？（設備採購、雲端環境、外部顧問）</span>
              </li>
            </ol>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-base font-semibold mb-4 text-cyan-400">關於團隊與節奏</h3>
            <ol start={7} className="space-y-4 text-slate-300">
              <li className="flex gap-3">
                <span className="text-cyan-500 font-mono text-sm mt-0.5 font-medium">7.</span>
                <span>團隊的擴編規劃是怎麼想的？什麼時候會有第二個人加入？</span>
              </li>
              <li className="flex gap-3">
                <span className="text-cyan-500 font-mono text-sm mt-0.5 font-medium">8.</span>
                <span>前期的里程碑和時程期待是什麼？</span>
              </li>
              <li className="flex gap-3">
                <span className="text-cyan-500 font-mono text-sm mt-0.5 font-medium">9.</span>
                <span>如果驗證過程中發現需要調整方向，決策流程會是怎樣的？</span>
              </li>
            </ol>
          </div>
        </div>
      </section>

    </div>
  );
}
