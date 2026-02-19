import { useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { TbBrandCashapp } from 'react-icons/tb'
import { AiOutlineDelete, AiOutlineCheckCircle } from 'react-icons/ai'
import { IoIosSettings } from 'react-icons/io'
import { FaHome } from 'react-icons/fa'
import { FaPix } from 'react-icons/fa6'
import confetti from 'canvas-confetti'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
  setDoc,
  writeBatch,
  getDocs,
  query,
  orderBy
} from 'firebase/firestore'
import { db } from './firebase'
import { BiSolidSelectMultiple } from 'react-icons/bi'

type Entry = {
  name: string
  paid: boolean
  reservedAt?: any
}

type AppConfig = {
  raffleName?: string
  totalNumbers?: number
  drawDate?: string
  resultNumber?: number | null
}

const PRICE_PER_NUMBER = 2

const PIX_KEY = String(import.meta.env.VITE_PIX_KEY || '').trim()
const PIX_NAME = String(import.meta.env.VITE_PIX_NAME || '').trim()
const PIX_BANK = String(import.meta.env.VITE_PIX_BANK || '').trim()

const moneyBR = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function formatWhen(v: any) {
  try {
    if (!v) return ''
    if (v.toDate) return v.toDate().toLocaleString('pt-BR')
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return d.toLocaleString('pt-BR')
    return String(v)
  } catch {
    return ''
  }
}

function formatDateBR(iso: string) {
  try {
    if (!iso) return ''
    const d = new Date(iso + 'T00:00:00')
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}

function clampTotal(n: any) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 200
  const i = Math.floor(v)
  if (i < 1) return 1
  if (i > 5000) return 5000
  return i
}

function pickRandom(list: number[]) {
  const idx = Math.floor(Math.random() * list.length)
  return list[idx]
}

function normalizeWinnerNumber(v: any) {
  if (v === undefined || v === null) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

function fireWinnerConfetti() {
  confetti({
    particleCount: 160,
    angle: 90,
    spread: 65,
    startVelocity: 55,
    gravity: 1.1,
    ticks: 220,
    origin: { x: 0.5, y: 0.95 }
  })
}

type ModalStep = 'pick' | 'review'
type MultiPayStep = 'names' | 'numbers' | 'review'
type MultiAction = 'paid' | 'pending' | 'delete'

function useConfig() {
  const [cfg, setCfg] = useState<AppConfig>({})
  const [cfgError, setCfgError] = useState('')

  useEffect(() => {
    const ref = doc(db, 'app', 'config')
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setCfg({})
          return
        }
        setCfg(snap.data() as AppConfig)
      },
      (err) => setCfgError(String(err?.message || err))
    )
  }, [])

  return { cfg, cfgError }
}

function useEntries(total: number) {
  const [entries, setEntries] = useState<Record<string, Entry | null>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    const col = collection(db, 'entries')
    return onSnapshot(
      col,
      (snap) => {
        const map: Record<string, Entry | null> = {}
        for (let i = 1; i <= total; i++) map[String(i)] = null

        snap.forEach((d) => {
          const id = d.id
          if (!/^\d+$/.test(id)) return
          const n = Number(id)
          if (n < 1 || n > total) return
          map[id] = d.data() as Entry
        })

        setEntries(map)
      },
      (err) => setError(String(err?.message || err))
    )
  }, [total])

  return { entries, error, setError }
}

function TitleBlock() {
  return (
    <div className="titleBlock">
      <div className="t1">
        Estamos com uma <span className="emph">rifa incrível</span>!
      </div>
      <div className="t2">
        Uma <span className="emph">faca</span> com <span className="emph">68 cm</span> de comprimento total e{' '}
        <span className="emph">47 cm</span> de lâmina.
      </div>
      <div className="t3">
        O valor é de apenas <span className="price">R$ 2,00</span> por número, num total de{' '}
        <span className="emph">200 números</span>.
      </div>
    </div>
  )
}

function SummaryCard(props: { cfg: AppConfig; stats: any; chart: any; onOpenImage: () => void }) {
  const { stats, chart, onOpenImage } = props

  return (
    <div className="dashCard">
      <div className="dashTop">
        <div className="dashLeft">
          <div className="sideTitle">Resumo</div>

          <div className="dashGrid">
            <div className="dashRow">
              <div>Total de números</div>
              <div className="val">{stats.total}</div>
            </div>
            <div className="dashRow">
              <div>Reservados</div>
              <div className="val">{stats.reserved}</div>
            </div>
            <div className="dashRow">
              <div>Disponíveis</div>
              <div className="val">{stats.available}</div>
            </div>
            <div className="dashRow">
              <div>Pagos</div>
              <div className="val">{stats.paid}</div>
            </div>
            <div className="dashRow">
              <div>Pendentes</div>
              <div className="val">{stats.pending}</div>
            </div>
          </div>

          <div className="chartTitle">Gráfico</div>
          <div className="bar">
            <div className="seg free" style={{ width: `${chart.freePct}%` }} />
            <div className="seg paid" style={{ width: `${chart.paidPct}%` }} />
            <div className="seg pending" style={{ width: `${chart.pendingPct}%` }} />
          </div>

          <div className="legend">
            <div className="leg">
              <span className="dot free" /> Livres {chart.free}
            </div>
            <div className="leg">
              <span className="dot paid" /> Pagos {chart.paid}
            </div>
            <div className="leg">
              <span className="dot pending" /> Pendentes {chart.pending}
            </div>
          </div>
        </div>

        <div className="dashRight">
          <button className="photoWrapBtn" onClick={onOpenImage} title="Abrir imagem">
            <img className="photoImg" src="/image_rifa.jpeg" alt="Foto da rifa" />
            <div className="photoHint">Toque para ampliar</div>
          </button>
        </div>
      </div>
    </div>
  )
}

function PixPaymentCard(props: { title?: string }) {
  const { title } = props

  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<any>(null)

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [])

  if (!PIX_KEY) return null

  async function copyPix() {
    try {
      await navigator.clipboard.writeText(PIX_KEY)
      setCopied(true)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="pixCard">
      <div className="pixTop">
        <div className="pixTopLeft">
          <FaPix className="pixIcon" />
          <div className="pixTitle">{title || 'Pagamento via Pix'}</div>
        </div>

        {copied ? (
          <div className="pixCopied">
            <AiOutlineCheckCircle />
            <span>Chave copiada</span>
          </div>
        ) : null}
      </div>

      <div className="pixRows">
        <div className="pixRow">
          <div className="pixLabel">Chave Pix</div>
          <div className="pixValue pixKeyLine">
            <span className="pixMono">{PIX_KEY}</span>
            <button className="pixCopyBtn" onClick={copyPix} title="Copiar chave Pix">
              Copiar
            </button>
          </div>
        </div>

        {PIX_NAME ? (
          <div className="pixRow">
            <div className="pixLabel">Nome</div>
            <div className="pixValue">{PIX_NAME}</div>
          </div>
        ) : null}

        {PIX_BANK ? (
          <div className="pixRow">
            <div className="pixLabel">Banco</div>
            <div className="pixValue">{PIX_BANK}</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function HomePage() {
  const { cfg, cfgError } = useConfig()
  const total = clampTotal(cfg.totalNumbers ?? 200)
  const { entries, error, setError } = useEntries(total)

  const [busy, setBusy] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState<ModalStep>('pick')
  const [modalName, setModalName] = useState('')
  const [selectedSet, setSelectedSet] = useState<Record<string, true>>({})

  const [imageOpen, setImageOpen] = useState(false)
  const nav = useNavigate()

  const [homeSearch, setHomeSearch] = useState('')

  const [payOpen, setPayOpen] = useState(false)
  const [payAmount, setPayAmount] = useState<number>(0)
  const [payCount, setPayCount] = useState<number>(0)

  const lastWinnerKeyRef = useRef('')

  const LAST_NAME_KEY = 'rifa_last_name'

  useEffect(() => {
    if (cfgError) setError(cfgError)
  }, [cfgError, setError])

  const winnerNumber = useMemo(() => {
    return normalizeWinnerNumber(cfg.resultNumber)
  }, [cfg.resultNumber])

  const winnerName = useMemo(() => {
    if (!winnerNumber) return ''
    const e = entries[String(winnerNumber)]
    return String(e?.name || '').trim()
  }, [entries, winnerNumber])

  useEffect(() => {
    if (!winnerNumber) return
    const key = `${winnerNumber}|${winnerName}`
    if (key === lastWinnerKeyRef.current) return
    lastWinnerKeyRef.current = key
    fireWinnerConfetti()
  }, [winnerNumber, winnerName])

  useEffect(() => {
    const open = modalOpen || imageOpen || payOpen

    const prevBodyOverflow = document.body.style.overflow
    const prevHtmlOverflow = document.documentElement.style.overflow

    if (open) {
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    }

    return () => {
      document.body.style.overflow = prevBodyOverflow
      document.documentElement.style.overflow = prevHtmlOverflow
    }
  }, [modalOpen, imageOpen, payOpen])

  const stats = useMemo(() => {
    const totalN = total
    let reserved = 0
    let paid = 0

    for (let i = 1; i <= totalN; i++) {
      const e = entries[String(i)]
      if (e) {
        reserved++
        if (e.paid) paid++
      }
    }

    const available = totalN - reserved
    const pending = reserved - paid
    const pctReserved = totalN ? reserved / totalN : 0
    const pctPaidOfReserved = reserved ? paid / reserved : 0

    return { total: totalN, reserved, available, paid, pending, pctReserved, pctPaidOfReserved }
  }, [entries, total])

  const chart = useMemo(() => {
    const free = stats.available
    const paid = stats.paid
    const pending = stats.pending
    const sum = free + paid + pending || 1
    return {
      free,
      paid,
      pending,
      freePct: (free / sum) * 100,
      paidPct: (paid / sum) * 100,
      pendingPct: (pending / sum) * 100
    }
  }, [stats])

  const reservations = useMemo(() => {
    const list: Array<{ n: number; e: Entry }> = []
    for (let i = 1; i <= total; i++) {
      const e = entries[String(i)]
      if (e) list.push({ n: i, e })
    }
    return list
  }, [entries, total])

  const filteredReservations = useMemo(() => {
    const q = homeSearch.trim().toLowerCase()
    if (!q) return reservations
    return reservations.filter((x) => {
      const nm = String(x.e?.name || '').toLowerCase()
      const num = String(x.n)
      return nm.includes(q) || num.includes(q)
    })
  }, [reservations, homeSearch])

  const availableNumbers = useMemo(() => {
    const list: number[] = []
    for (let i = 1; i <= total; i++) {
      if (!entries[String(i)]) list.push(i)
    }
    return list
  }, [entries, total])

  const selectedNumbers = useMemo(() => {
    return Object.keys(selectedSet)
      .map((k) => Number(k))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= total)
      .sort((a, b) => a - b)
  }, [selectedSet, total])

  function readLastName() {
    try {
      return String(localStorage.getItem(LAST_NAME_KEY) || '').trim()
    } catch {
      return ''
    }
  }

  function writeLastName(name: string) {
    try {
      const v = String(name || '').trim()
      if (!v) {
        localStorage.removeItem(LAST_NAME_KEY)
        return
      }
      localStorage.setItem(LAST_NAME_KEY, v)
    } catch {
    }
  }

  function openModal() {
    setError('')
    setBusy(false)
    setModalOpen(true)
    setModalStep('pick')
    setModalName(readLastName())
    setSelectedSet({})
  }

  function closeModal() {
    if (busy) return
    setModalOpen(false)
    setModalStep('pick')
    setModalName('')
    setSelectedSet({})
  }

  function toggleSelect(n: number) {
    const k = String(n)
    setSelectedSet((prev) => {
      const next = { ...prev }
      if (next[k]) delete next[k]
      else next[k] = true
      return next
    })
  }

  function canGoNext() {
    if (!modalName.trim()) return false
    if (!selectedNumbers.length) return false
    return true
  }

  function closePayModal() {
    setPayOpen(false)
    setPayAmount(0)
    setPayCount(0)
  }

  async function confirmReserve() {
    const name = modalName.trim()
    const nums = selectedNumbers.slice()
    if (!name || !nums.length) return

    setBusy(true)
    setError('')

    try {
      await runTransaction(db, async (tx) => {
        for (const n of nums) {
          const ref = doc(db, 'entries', String(n))
          const snap = await tx.get(ref)
          if (snap.exists()) throw new Error(`RESERVED:${n}`)
        }

        for (const n of nums) {
          const ref = doc(db, 'entries', String(n))
          tx.set(ref, { name, paid: false, reservedAt: serverTimestamp() })
        }
      })

      writeLastName(name)

      const count = nums.length
      const amount = count * PRICE_PER_NUMBER

      setBusy(false)
      closeModal()

      setPayCount(count)
      setPayAmount(amount)
      setPayOpen(true)
    } catch (e: any) {
      const msg = String(e?.message || e)
      if (msg.startsWith('RESERVED:')) {
        const n = msg.split(':')[1] || ''
        setError(`O número ${n} foi reservado por outra pessoa. Escolha outro.`)
      } else {
        setError(msg)
      }
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="topCard">
        <div className="brandRow">
          <div className="brandOnly">{cfg.raffleName || 'Rifa'}</div>

          <button
            className="adminIconBtn"
            onClick={() => nav('/admin')}
            title="Configurações"
            aria-label="Configurações"
          >
            <IoIosSettings />
          </button>
        </div>

        <TitleBlock />
        {error ? <div className="error">{error}</div> : null}
      </div>

      <button className="reserveBtn" onClick={openModal} title="Nova reserva">
        <span className="reserveBtnText">Reservar rifa</span>
        <span className="reserveBtnPlus">+</span>
      </button>

      <div className="resultBox resultBoxTop">
        <div className="resultBigLabel">{winnerNumber ? 'Vencedor' : 'Resultado'}</div>
        <div className="resultBigValue">
          {winnerNumber
            ? winnerName
              ? `${winnerNumber} (${winnerName})`
              : String(winnerNumber)
            : cfg.drawDate
              ? formatDateBR(cfg.drawDate)
              : '-'}
        </div>
      </div>

      <PixPaymentCard title="Pagamento" />

      <SummaryCard cfg={cfg} stats={stats} chart={chart} onOpenImage={() => setImageOpen(true)} />

      <div className="listCard">
        <div className="listTitle">
          <span>Reservas realizadas</span>
          <span className="smallHint">Total: {filteredReservations.length}</span>
        </div>

        <div style={{ padding: 12 }}>
          <div className="modalLabel" style={{ marginBottom: 5 }}>Buscar por número ou nome</div>
          <input
            className="modalInput"
            value={homeSearch}
            onChange={(e) => setHomeSearch(e.target.value)}
            placeholder="Digite para filtrar"
          />
        </div>

        <div className="listHead home">
          <div className="lh center">Número</div>
          <div className="lh">Nome</div>
          <div className="lh center">Reserva em</div>
          <div className="lh center">Pagamento</div>
        </div>

        <div className="listBody">
          {filteredReservations.length ? (
            filteredReservations.map(({ n, e }) => {
              const paid = !!e.paid
              return (
                <div key={n} className="listRow home">
                  <div className="lc num center">{n}</div>
                  <div className="lc nameCell" title={e.name}>
                    {e.name}
                  </div>
                  <div className="lc whenCell center mono">{formatWhen(e.reservedAt)}</div>
                  <div className="lc payCell center">
                    <div className={'payPill ' + (paid ? 'pillPaid' : 'pillPending')}>
                      <TbBrandCashapp className={'cashIcon ' + (paid ? 'cashPaid' : 'cashPending')} />
                      <span className="payText">{paid ? 'Pago' : 'Não Pago'}</span>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="empty">Nenhuma reserva encontrada</div>
          )}
        </div>
      </div>

      {imageOpen ? (
        <div className="modalOverlay" onMouseDown={() => setImageOpen(false)}>
          <div className="imgModal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="imgClose" onClick={() => setImageOpen(false)} aria-label="Fechar">
              ×
            </button>
            <img className="imgFull" src="/image_rifa.jpeg" alt="Foto da rifa ampliada" />
          </div>
        </div>
      ) : null}

      {payOpen ? (
        <div className="modalOverlay" onMouseDown={closePayModal}>
          <div className="modalCard payModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div className="modalTitle">Reserva confirmada</div>
              <button className="modalClose" onClick={closePayModal} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className="modalBody">
              <div className="payAmountBox">
                <div className="payAmountLabel">Valor a pagar</div>
                <div className="payAmountValue">{moneyBR.format(payAmount)}</div>
                <div className="payAmountHint">
                  {payCount} {payCount === 1 ? 'número' : 'números'} x {moneyBR.format(PRICE_PER_NUMBER)}
                </div>
              </div>

              <PixPaymentCard title="Dados do Pix" />
              {!PIX_KEY ? (
                <div className="hint" style={{ marginTop: 10 }}>
                  Faltou configurar VITE_PIX_KEY no .env, então não dá para mostrar a chave aqui.
                </div>
              ) : null}
            </div>

            <div className="modalActions">
              <button className="btnPrimary btnPrimaryWide" onClick={closePayModal}>
                Ok
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="modalOverlay" onMouseDown={closeModal}>
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div className="modalTitle">{modalStep === 'pick' ? 'Nova reserva' : 'Confirmar reserva'}</div>
              <button className="modalClose" onClick={closeModal} aria-label="Fechar">
                ×
              </button>
            </div>

            {modalStep === 'pick' ? (
              <div className="modalBody">
                <div className="nameRow">
                  <div className="modalLabel">Seu nome</div>
                  <input
                    className="modalInput small"
                    value={modalName}
                    onChange={(e) => setModalName(e.target.value)}
                    placeholder="Digite seu nome"
                    disabled={busy}
                  />
                </div>

                <div className="modalLabel">Escolha seus números disponíveis</div>

                <div className="badges">
                  {availableNumbers.map((n) => {
                    const isSel = !!selectedSet[String(n)]
                    return (
                      <button
                        key={n}
                        className={'badge ' + (isSel ? 'badgeSel' : 'badgeFree')}
                        onClick={() => toggleSelect(n)}
                        disabled={busy}
                        title={isSel ? 'Remover' : 'Selecionar'}
                      >
                        {n}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="modalBody">
                <div className="reviewBlock">
                  <div className="reviewLine">
                    <span className="reviewLabel">Nome</span>
                    <span className="reviewValue">{modalName.trim()}</span>
                  </div>

                  <div className="reviewLine">
                    <span className="reviewLabel">Números</span>
                    <span className="reviewValue">{selectedNumbers.join(', ')}</span>
                  </div>
                </div>

                <div className="hint">Se alguém pegar um dos números antes de você confirmar, vamos avisar.</div>
              </div>
            )}

            <div className="modalActions">
              <button className="btn" onClick={closeModal} disabled={busy}>
                Cancelar
              </button>

              {modalStep === 'pick' ? (
                <button className="btnPrimary" onClick={() => setModalStep('review')} disabled={busy || !canGoNext()}>
                  Avançar
                </button>
              ) : (
                <>
                  <button className="btn" onClick={() => setModalStep('pick')} disabled={busy}>
                    Voltar
                  </button>
                  <button className="btnPrimary" onClick={confirmReserve} disabled={busy}>
                    Confirmar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AdminPage() {
  const nav = useNavigate()
  const { cfg, cfgError } = useConfig()
  const totalCfg = clampTotal(cfg.totalNumbers ?? 200)
  const { entries, error, setError } = useEntries(totalCfg)

  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<Record<string, true>>({})
  const [confirmDelete, setConfirmDelete] = useState<{ n: number } | null>(null)

  const [pw, setPw] = useState('')
  const [authed, setAuthed] = useState(false)

  const [raffleName, setRaffleName] = useState('')
  const [drawDate, setDrawDate] = useState('')
  const [resultNumber, setResultNumber] = useState<string>('')
  const [totalNumbers, setTotalNumbers] = useState<string>('')

  const [multiOpen, setMultiOpen] = useState(false)
  const [multiStep, setMultiStep] = useState<MultiPayStep>('names')
  const [multiSearch, setMultiSearch] = useState('')
  const [multiName, setMultiName] = useState('')
  const [multiSet, setMultiSet] = useState<Record<string, true>>({})
  const [multiAction, setMultiAction] = useState<MultiAction | null>(null)
  const [multiBusy, setMultiBusy] = useState(false)

  const [adminListSearch, setAdminListSearch] = useState('')

  useEffect(() => {
    if (cfgError) setError(cfgError)
  }, [cfgError, setError])

  useEffect(() => {
    const ok = localStorage.getItem('rifa_admin_ok') === '1'
    setAuthed(ok)
  }, [])

  useEffect(() => {
    setRaffleName(cfg.raffleName || '')
    setDrawDate(cfg.drawDate || '')
    setResultNumber(
      cfg.resultNumber !== undefined && cfg.resultNumber !== null && cfg.resultNumber !== 0 ? String(cfg.resultNumber) : ''
    )
    setTotalNumbers(String(clampTotal(cfg.totalNumbers ?? 200)))
  }, [cfg.raffleName, cfg.drawDate, cfg.resultNumber, cfg.totalNumbers])

  useEffect(() => {
    const open = multiOpen || !!confirmDelete

    const prevBodyOverflow = document.body.style.overflow
    const prevHtmlOverflow = document.documentElement.style.overflow

    if (open) {
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    }

    return () => {
      document.body.style.overflow = prevBodyOverflow
      document.documentElement.style.overflow = prevHtmlOverflow
    }
  }, [multiOpen, confirmDelete])

  const reservations = useMemo(() => {
    const list: Array<{ n: number; e: Entry }> = []
    for (let i = 1; i <= totalCfg; i++) {
      const e = entries[String(i)]
      if (e) list.push({ n: i, e })
    }
    return list
  }, [entries, totalCfg])

  const filteredReservations = useMemo(() => {
    const q = adminListSearch.trim().toLowerCase()

    const base = !q
      ? reservations
      : reservations.filter((x) => {
        const nm = String(x.e?.name || '').toLowerCase()
        const num = String(x.n)
        return nm.includes(q) || num.includes(q)
      })

    const pending: Array<{ n: number; e: Entry }> = []
    const paid: Array<{ n: number; e: Entry }> = []

    for (const r of base) {
      if (r.e?.paid) paid.push(r)
      else pending.push(r)
    }

    return pending.concat(paid)
  }, [reservations, adminListSearch])

  const maxReservedNumber = useMemo(() => {
    let max = 0
    for (let i = 1; i <= totalCfg; i++) {
      if (entries[String(i)]) max = i
    }
    return max
  }, [entries, totalCfg])

  const reservedNames = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of reservations) {
      const nm = String(r.e.name || '').trim()
      if (!nm) continue
      map.set(nm, (map.get(nm) || 0) + 1)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
      .map(([name, count]) => ({ name, count }))
  }, [reservations])

  const filteredReservedNames = useMemo(() => {
    const q = multiSearch.trim().toLowerCase()
    if (!q) return reservedNames
    return reservedNames.filter((x) => x.name.toLowerCase().includes(q))
  }, [reservedNames, multiSearch])

  const numbersForSelectedName = useMemo(() => {
    if (!multiName) return []
    const list: number[] = []
    for (const r of reservations) {
      if (String(r.e.name || '').trim() === multiName) list.push(r.n)
    }
    return list.sort((a, b) => a - b)
  }, [reservations, multiName])

  const selectedMultiNumbers = useMemo(() => {
    return Object.keys(multiSet)
      .map((k) => Number(k))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= totalCfg)
      .sort((a, b) => a - b)
  }, [multiSet, totalCfg])

  const winnerNumberAdmin = useMemo(() => {
    return normalizeWinnerNumber(cfg.resultNumber)
  }, [cfg.resultNumber])

  const winnerNameAdmin = useMemo(() => {
    if (!winnerNumberAdmin) return ''
    const e = entries[String(winnerNumberAdmin)]
    return String(e?.name || '').trim()
  }, [entries, winnerNumberAdmin])

  function setLineBusy(n: number, v: boolean) {
    const k = String(n)
    setRowBusy((prev) => {
      const next = { ...prev }
      if (v) next[k] = true
      else delete next[k]
      return next
    })
  }

  async function togglePaid(n: number) {
    const e = entries[String(n)]
    if (!e) return
    if (rowBusy[String(n)]) return

    setLineBusy(n, true)
    setError('')

    try {
      await updateDoc(doc(db, 'entries', String(n)), { paid: !e.paid })
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setLineBusy(n, false)
    }
  }

  async function doDelete(n: number) {
    const e = entries[String(n)]
    if (!e) return
    if (rowBusy[String(n)]) return

    setLineBusy(n, true)
    setError('')

    try {
      await deleteDoc(doc(db, 'entries', String(n)))
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setLineBusy(n, false)
      setConfirmDelete(null)
    }
  }

  function login() {
    const expected = String(import.meta.env.VITE_ADMIN_PASSWORD || '')
    if (!expected) {
      setError('Faltou VITE_ADMIN_PASSWORD no .env')
      return
    }
    if (pw.trim() !== expected) {
      setError('Senha incorreta')
      return
    }
    localStorage.setItem('rifa_admin_ok', '1')
    setAuthed(true)
    setError('')
  }

  function logout() {
    localStorage.removeItem('rifa_admin_ok')
    setAuthed(false)
    setPw('')
    setError('')
  }

  async function saveConfig() {
    const newTotal = clampTotal(totalNumbers)
    if (newTotal < maxReservedNumber) {
      setError(`Não é possível reduzir para ${newTotal} porque já existe reserva no número ${maxReservedNumber}.`)
      return
    }

    setBusy(true)
    setError('')

    try {
      const ref = doc(db, 'app', 'config')

      await setDoc(
        ref,
        {
          raffleName: raffleName.trim(),
          totalNumbers: newTotal,
          drawDate: drawDate.trim()
        },
        { merge: true }
      )
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function sortear() {
    const paidNums = reservations.filter((r) => !!r.e.paid).map((r) => r.n)

    if (!paidNums.length) {
      setError('Não tem números pagos para sortear')
      return
    }

    const n = pickRandom(paidNums)
    setResultNumber(String(n))

    setBusy(true)
    setError('')
    try {
      await setDoc(doc(db, 'app', 'config'), { resultNumber: n }, { merge: true })
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function resetSorteio() {
    setResultNumber('')
    setBusy(true)
    setError('')
    try {
      await setDoc(doc(db, 'app', 'config'), { resultNumber: null }, { merge: true })
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function openMultiPay() {
    setError('')
    setMultiOpen(true)
    setMultiStep('names')
    setMultiSearch('')
    setMultiName('')
    setMultiSet({})
    setMultiAction(null)
    setMultiBusy(false)
  }

  function closeMultiPay() {
    if (multiBusy) return
    setMultiOpen(false)
    setMultiStep('names')
    setMultiSearch('')
    setMultiName('')
    setMultiSet({})
    setMultiAction(null)
    setMultiBusy(false)
  }

  function pickMultiName(name: string) {
    setMultiName(name)
    setMultiSet({})
    setMultiAction(null)
    setMultiStep('numbers')
  }

  function toggleMultiNumber(n: number) {
    const k = String(n)
    setMultiSet((prev) => {
      const next = { ...prev }
      if (next[k]) delete next[k]
      else next[k] = true
      return next
    })
  }

  function toggleSelectAllMulti() {
    const all = numbersForSelectedName
    if (!all.length) return
    const allSelected = all.every((n) => !!multiSet[String(n)])
    if (allSelected) {
      setMultiSet({})
      return
    }
    const next: Record<string, true> = {}
    for (const n of all) next[String(n)] = true
    setMultiSet(next)
  }

  function goReviewMulti(action: MultiAction) {
    if (!multiName) return
    if (!selectedMultiNumbers.length) return
    setMultiAction(action)
    setMultiStep('review')
  }

  async function confirmMultiPay() {
    if (!multiName) return
    if (!multiAction) return
    const nums = selectedMultiNumbers.slice()
    if (!nums.length) return

    setMultiBusy(true)
    setError('')

    try {
      const batch = writeBatch(db)

      if (multiAction === 'delete') {
        for (const n of nums) {
          batch.delete(doc(db, 'entries', String(n)))
        }
      } else {
        const paidValue = multiAction === 'paid'
        for (const n of nums) {
          batch.update(doc(db, 'entries', String(n)), { paid: paidValue })
        }
      }

      await batch.commit()

      setMultiBusy(false)
      closeMultiPay()
    } catch (e: any) {
      setError(String(e?.message || e))
      setMultiBusy(false)
    }
  }

  if (!authed) {
    return (
      <div className="page">
        <div className="topCard">
          <div className="brandOnly">{cfg.raffleName || 'Rifa'}</div>
          <div className="adminLoginCard">
            <div className="adminLoginTitle">Admin</div>

            {error ? <div className="error">{error}</div> : null}

            <div className="adminLoginRow">
              <input
                className="adminPw"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Senha"
                type="password"
              />
              <button className="btnPrimary" onClick={login}>
                Entrar
              </button>
            </div>

            <div className="hint">Acesse direto por /admin</div>
          </div>
        </div>

        <div className="backRow">
          <button className="btn" onClick={() => nav('/')}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topCard">
        <div className="brandRow">
          <div className="brandOnly">{cfg.raffleName || 'Rifa'}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="adminIconBtn" onClick={() => nav('/')} title="Página inicial" aria-label="Página inicial">
              <FaHome />
            </button>
            <button className="adminLinkBtn" onClick={logout}>
              Sair
            </button>
          </div>
        </div>

        <div className="adminPanel">
          <div className="adminPanelTitle">Configuração do resultado</div>

          {error ? <div className="error">{error}</div> : null}

          <div className="adminGrid">
            <div className="adminField">
              <div className="adminLabel">Quantidade de Rifas para Sorteio</div>
              <input
                className="adminInput"
                value={totalNumbers}
                onChange={(e) => setTotalNumbers(e.target.value)}
                inputMode="numeric"
              />
              {maxReservedNumber ? (
                <div className="smallHint">Maior número reservado hoje: {maxReservedNumber}</div>
              ) : (
                <div className="smallHint">Ainda não tem reservas</div>
              )}
            </div>

            <div className="adminField">
              <div className="adminLabel">Data do sorteio</div>
              <input
                className="adminInput"
                type="date"
                value={drawDate}
                onChange={(e) => setDrawDate(e.target.value)}
                onClick={(e) => (e.currentTarget as any).showPicker?.()}
              />
            </div>

            <div className="adminField">
              <div className="adminLabel">Resultado</div>
              <div className="adminInput">
                {winnerNumberAdmin
                  ? winnerNameAdmin
                    ? `${winnerNumberAdmin} (${winnerNameAdmin})`
                    : String(winnerNumberAdmin)
                  : resultNumber.trim()
                    ? resultNumber.trim()
                    : '-'}
              </div>
            </div>
          </div>

          <div className="adminButtons">
            <button className="btn" onClick={resetSorteio} disabled={busy}>
              Resetar sorteio
            </button>
            <button className="btn" onClick={sortear} disabled={busy}>
              Sortear
            </button>
            <button className="btnPrimary" onClick={saveConfig} disabled={busy}>
              Salvar
            </button>
          </div>
        </div>
      </div>

      <div className="listCard">
        <div className="listTitle">
          <span>Reservas realizadas</span>

          <button className="multiPayBtn" onClick={openMultiPay} title="Pagar múltiplos" aria-label="Pagar múltiplos">
            <span>Ação Sobre Vários</span>
            <BiSolidSelectMultiple color='green' />
          </button>
        </div>

        <div style={{ padding: 12 }}>
          <div className="modalLabel" style={{ marginBottom: 5 }}>Buscar por número ou nome</div>
          <input
            className="modalInput"
            value={adminListSearch}
            onChange={(e) => setAdminListSearch(e.target.value)}
            placeholder="Digite para filtrar"
          />
        </div>

        <div className="listHead admin">
          <div className="lh center">Número</div>
          <div className="lh">Nome</div>
          <div className="lh center">Reserva em</div>
          <div className="lh center">Pagamento</div>
          <div className="lh center">Excluir</div>
        </div>

        <div className="listBody">
          {filteredReservations.length ? (
            filteredReservations.map(({ n, e }) => {
              const paid = !!e.paid
              const isRowBusy = !!rowBusy[String(n)]

              return (
                <div key={n} className="listRow admin">
                  <div className="lc num center">{n}</div>
                  <div className="lc nameCell" title={e.name}>
                    {e.name}
                  </div>
                  <div className="lc whenCell center mono">{formatWhen(e.reservedAt)}</div>

                  <div className="lc payCell center">
                    <button
                      className={'payToggle ' + (paid ? 'isPaid' : 'isPending') + (isRowBusy ? ' isLoading' : '')}
                      onClick={() => togglePaid(n)}
                      disabled={isRowBusy}
                      title="Alternar pago"
                    >
                      <TbBrandCashapp className={'cashIcon ' + (paid ? 'cashPaid' : 'cashPending')} />
                      <span className="payText">{paid ? 'Pago' : 'Não Pago'}</span>
                    </button>
                  </div>

                  <div className="lc delCell center">
                    <button
                      className="delBtn"
                      onClick={() => setConfirmDelete({ n })}
                      disabled={isRowBusy}
                      title="Excluir reserva"
                    >
                      <AiOutlineDelete className="delIcon" />
                    </button>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="empty">Nenhuma reserva encontrada</div>
          )}
        </div>
      </div>

      {confirmDelete ? (
        <div className="modalOverlay" onMouseDown={() => setConfirmDelete(null)}>
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div className="modalTitle">Confirmar exclusão</div>
              <button className="modalClose" onClick={() => setConfirmDelete(null)} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className="modalBody">
              <div className="reviewBlock">
                <div className="reviewLine">
                  <span className="reviewLabel">Número</span>
                  <span className="reviewValue">{confirmDelete.n}</span>
                </div>
                <div className="hint">Isso vai remover a reserva desse número.</div>
              </div>
            </div>

            <div className="modalActions">
              <button className="btn" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button
                className="btnPrimary"
                onClick={() => doDelete(confirmDelete.n)}
                disabled={!!rowBusy[String(confirmDelete.n)]}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {multiOpen ? (
        <div className="modalOverlay" onMouseDown={closeMultiPay}>
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div className="modalTitle">Pagar múltiplos</div>
              <button className="modalClose" onClick={closeMultiPay} aria-label="Fechar" disabled={multiBusy}>
                ×
              </button>
            </div>

            {multiStep === 'names' ? (
              <div className="modalBody">
                <div className="nameRow">
                  <div className="modalLabel">Buscar nome</div>
                  <input
                    className="modalInput"
                    value={multiSearch}
                    onChange={(e) => setMultiSearch(e.target.value)}
                    placeholder="Digite para filtrar"
                    disabled={multiBusy}
                  />
                </div>

                <div className="modalLabel">Selecione um nome</div>

                <div className="mpNames">
                  {filteredReservedNames.length ? (
                    filteredReservedNames.map((x) => (
                      <button
                        key={x.name}
                        className="mpNameBtn"
                        onClick={() => pickMultiName(x.name)}
                        disabled={multiBusy}
                        title={x.name}
                      >
                        <span className="mpNameText">{x.name}</span>
                        <span className="mpNameCount">{x.count}</span>
                      </button>
                    ))
                  ) : (
                    <div className="empty">Nenhuma reserva encontrada</div>
                  )}
                </div>
              </div>
            ) : multiStep === 'numbers' ? (
              <div className="modalBody">
                <div className="reviewBlock">
                  <div className="reviewLine">
                    <span className="reviewLabel">Nome</span>
                    <span className="reviewValue">{multiName}</span>
                  </div>
                  <div className="hint">Selecione as rifas que deseja marcar.</div>
                </div>

                <div className="mpTopActions">
                  <button className="btn" onClick={toggleSelectAllMulti} disabled={multiBusy || !numbersForSelectedName.length}>
                    Selecionar todas
                  </button>
                  <div className="smallHint">
                    Total: {numbersForSelectedName.length} | Selecionadas: {selectedMultiNumbers.length}
                  </div>
                </div>

                <div className="badges">
                  {numbersForSelectedName.map((n) => {
                    const isSel = !!multiSet[String(n)]
                    return (
                      <button
                        key={n}
                        className={'badge ' + (isSel ? 'badgeSel' : 'badgeFree')}
                        onClick={() => toggleMultiNumber(n)}
                        disabled={multiBusy}
                        title={isSel ? 'Remover' : 'Selecionar'}
                      >
                        {n}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="modalBody">
                <div className="reviewBlock">
                  <div className="reviewLine">
                    <span className="reviewLabel">Nome</span>
                    <span className="reviewValue">{multiName}</span>
                  </div>

                  <div className="reviewLine">
                    <span className="reviewLabel">Rifas</span>
                    <span className="reviewValue">{selectedMultiNumbers.join(', ')}</span>
                  </div>

                  <div className="reviewLine">
                    <span className="reviewLabel">Ação</span>
                    <span
                      className={
                        'reviewValue ' +
                        (multiAction === 'paid' ? 'mpTextPaid' : multiAction === 'pending' ? 'mpTextPending' : 'mpTextPending')
                      }
                    >
                      {multiAction === 'paid'
                        ? 'Declarar pago'
                        : multiAction === 'pending'
                          ? 'Declarar não pago'
                          : 'Excluir'}
                    </span>
                  </div>
                </div>

                <div className="hint">
                  {multiAction === 'delete'
                    ? 'Confirme para excluir as reservas selecionadas.'
                    : 'Confirme para aplicar o status em lote.'}
                </div>
              </div>
            )}

            <div className="modalActions">
              {multiStep === 'names' ? null : multiStep === 'numbers' ? (
                <>
                  <button
                    className="btnGood"
                    onClick={() => goReviewMulti('paid')}
                    disabled={multiBusy || !selectedMultiNumbers.length}
                    title="Marcar como pago"
                  >
                    <TbBrandCashapp className="cashIcon cashPaid" />
                    <span>Declarar pago</span>
                  </button>
                  <button
                    className="btnBad"
                    onClick={() => goReviewMulti('pending')}
                    disabled={multiBusy || !selectedMultiNumbers.length}
                    title="Marcar como não pago"
                  >
                    <TbBrandCashapp className="cashIcon cashPending" />
                    <span>Declarar não pago</span>
                  </button>
                  <button
                    className="btnDanger"
                    onClick={() => goReviewMulti('delete')}
                    disabled={multiBusy || !selectedMultiNumbers.length}
                    title="Excluir reservas"
                  >
                    <AiOutlineDelete className="delIcon" />
                    <span>Excluir</span>
                  </button>

                  <button className="btn" onClick={() => setMultiStep('names')} disabled={multiBusy}>
                    Voltar
                  </button>
                </>
              ) : (
                <>
                  <button className="btnPrimary btnPrimaryWide" onClick={confirmMultiPay} disabled={multiBusy}>
                    Confirmar
                  </button>

                  <button className="btn" onClick={() => setMultiStep('numbers')} disabled={multiBusy}>
                    Voltar
                  </button>
                </>
              )}

              <button className="btn" onClick={closeMultiPay} disabled={multiBusy}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

type BackupMeta = {
  name: string
  createdAt?: any
  docCount?: number
}

function DataAdminPage() {
  const nav = useNavigate()
  const { cfg } = useConfig()

  const [pw, setPw] = useState('')
  const [authed, setAuthed] = useState(false)

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')

  const [backups, setBackups] = useState<BackupMeta[]>([])
  const [selectedBackup, setSelectedBackup] = useState<string>('')
  const [backupSearch, setBackupSearch] = useState('')

  const [backupEntries, setBackupEntries] = useState<Array<{ n: number; e: Entry }>>([])
  const [backupEntrySearch, setBackupEntrySearch] = useState('')

  useEffect(() => {
    const ok = localStorage.getItem('rifa_admin_manage_ok') === '1'
    setAuthed(ok)
  }, [])

  useEffect(() => {
    const qy = query(collection(db, 'backups'), orderBy('createdAt', 'desc'))
    return onSnapshot(
      qy,
      (snap) => {
        const list: BackupMeta[] = []
        snap.forEach((d) => {
          const data = d.data() as any
          const name = String(data?.name || d.id)
          list.push({
            name,
            createdAt: data?.createdAt,
            docCount: Number(data?.docCount || 0)
          })
        })
        setBackups(list)
      },
      (err) => setError(String(err?.message || err))
    )
  }, [])

  function login() {
    const expected = String(import.meta.env.VITE_ADMIN_PASSWORD_MANAGE || '')
    if (!expected) {
      setError('Faltou VITE_ADMIN_PASSWORD_MANAGE no .env')
      return
    }
    if (pw.trim() !== expected) {
      setError('Senha incorreta')
      return
    }
    localStorage.setItem('rifa_admin_manage_ok', '1')
    setAuthed(true)
    setError('')
  }

  function logout() {
    localStorage.removeItem('rifa_admin_manage_ok')
    setAuthed(false)
    setPw('')
    setError('')
  }

  function stamp() {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  }

  async function generateBackup() {
    if (busy) return

    setBusy(true)
    setError('')
    setProgress('Lendo entries...')

    try {
      const backupName = `entries-${stamp()}`

      const snap = await getDocs(collection(db, 'entries'))
      const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }))

      if (!docs.length) {
        setProgress('')
        setBusy(false)
        setError('Não tem nada em entries para fazer backup')
        return
      }

      const CHUNK = 450
      const totalChunks = Math.ceil(docs.length / CHUNK)

      for (let i = 0; i < docs.length; i += CHUNK) {
        const chunkIndex = Math.floor(i / CHUNK) + 1
        setProgress(`Gravando ${chunkIndex}/${totalChunks}...`)

        const batch = writeBatch(db)
        const part = docs.slice(i, i + CHUNK)

        for (const x of part) {
          batch.set(doc(db, backupName, String(x.id)), x.data as any)
        }

        await batch.commit()
      }

      setProgress('Registrando backup...')
      await setDoc(
        doc(db, 'backups', backupName),
        {
          name: backupName,
          createdAt: serverTimestamp(),
          docCount: docs.length
        },
        { merge: true }
      )

      setSelectedBackup(backupName)
      setProgress('')
      setBusy(false)
    } catch (e: any) {
      setProgress('')
      setBusy(false)
      setError(String(e?.message || e))
    }
  }

  async function openBackup(name: string) {
    if (busy) return

    setSelectedBackup(name)
    setBackupEntries([])
    setBackupEntrySearch('')
    setError('')
    setProgress('Carregando backup...')

    try {
      const snap = await getDocs(collection(db, name))
      const list: Array<{ n: number; e: Entry }> = []

      snap.forEach((d) => {
        const id = d.id
        if (!/^\d+$/.test(id)) return
        const n = Number(id)
        if (n < 1) return
        list.push({ n, e: d.data() as Entry })
      })

      list.sort((a, b) => a.n - b.n)
      setBackupEntries(list)
      setProgress('')
    } catch (e: any) {
      setProgress('')
      setError(String(e?.message || e))
    }
  }

  const filteredBackups = useMemo(() => {
    const q = backupSearch.trim().toLowerCase()
    if (!q) return backups
    return backups.filter((b) => b.name.toLowerCase().includes(q))
  }, [backups, backupSearch])

  const filteredBackupEntries = useMemo(() => {
    const q = backupEntrySearch.trim().toLowerCase()
    if (!q) return backupEntries
    return backupEntries.filter((x) => {
      const nm = String(x.e?.name || '').toLowerCase()
      const num = String(x.n)
      return nm.includes(q) || num.includes(q)
    })
  }, [backupEntries, backupEntrySearch])

  if (!authed) {
    return (
      <div className="page dataPage">
        <div className="topCard">
          <div className="brandOnly">{cfg.raffleName || 'Rifa'}</div>
          <div className="adminLoginCard">
            <div className="adminLoginTitle">Admin Data</div>

            {error ? <div className="error">{error}</div> : null}

            <div className="adminLoginRow">
              <input
                className="adminPw"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Senha"
                type="password"
              />
              <button className="btnPrimary" onClick={login}>
                Entrar
              </button>
            </div>

            <div className="hint">Acesse direto por /admin/data</div>
          </div>
        </div>

        <div className="backRow">
          <button className="btn" onClick={() => nav('/')}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page dataPage">
      <div className="topCard">
        <div className="brandRow">
          <div className="brandOnly">{cfg.raffleName || 'Rifa'}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="adminIconBtn" onClick={() => nav('/admin')} title="Admin" aria-label="Admin">
              <IoIosSettings />
            </button>
            <button className="adminIconBtn" onClick={() => nav('/')} title="Página inicial" aria-label="Página inicial">
              <FaHome />
            </button>
            <button className="adminLinkBtn" onClick={logout}>
              Sair
            </button>
          </div>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <div className="adminPanel dataPanel">
          <div className="adminPanelTitle">Backups de entries</div>

          <div className="dataTopRow">
            <button className="btnPrimary" onClick={generateBackup} disabled={busy}>
              Gerar backup agora
            </button>

            <div className="dataProgress">
              {progress ? <span className="smallHint">{progress}</span> : null}
            </div>
          </div>

          <div className="dataSplit">
            <div className="dataCol">
              <div className="dataColTitle">Backups</div>

              <div className="nameRow">
                <div className="modalLabel">Buscar backup</div>
                <input
                  className="modalInput"
                  value={backupSearch}
                  onChange={(e) => setBackupSearch(e.target.value)}
                  placeholder="Digite para filtrar"
                  disabled={busy}
                />
              </div>

              <div className="dataBackups">
                {filteredBackups.length ? (
                  filteredBackups.map((b) => {
                    const isSel = b.name === selectedBackup
                    return (
                      <button
                        key={b.name}
                        className={'dataBackupBtn' + (isSel ? ' isSel' : '')}
                        onClick={() => openBackup(b.name)}
                        disabled={busy}
                        title={b.name}
                      >
                        <div className="dataBackupMain">
                          <div className="dataBackupName">{b.name}</div>
                          <div className="smallHint">
                            {b.createdAt ? formatWhen(b.createdAt) : ''}{b.docCount ? ` | docs: ${b.docCount}` : ''}
                          </div>
                        </div>
                      </button>
                    )
                  })
                ) : (
                  <div className="empty">Nenhum backup ainda</div>
                )}
              </div>
            </div>

            <div className="dataCol">
              <div className="dataColTitle">Conteúdo do backup</div>

              {selectedBackup ? (
                <>
                  <div className="reviewBlock">
                    <div className="reviewLine">
                      <span className="reviewLabel">Backup</span>
                      <span className="reviewValue">{selectedBackup}</span>
                    </div>
                    <div className="hint">Isso é uma cópia da coleção entries no momento do backup.</div>
                  </div>

                  <div className="nameRow" style={{ marginTop: 12 }}>
                    <div className="modalLabel" style={{ marginBottom: 5 }}>Buscar por número ou nome</div>
                    <input
                      className="modalInput"
                      value={backupEntrySearch}
                      onChange={(e) => setBackupEntrySearch(e.target.value)}
                      placeholder="Digite para filtrar"
                      disabled={busy}
                    />
                  </div>

                  <div className="listCard" style={{ marginTop: 12 }}>
                    <div className="listTitle">
                      <span>Itens</span>
                      <span className="smallHint">Total: {filteredBackupEntries.length}</span>
                    </div>

                    <div className="listHead home">
                      <div className="lh center">Número</div>
                      <div className="lh">Nome</div>
                      <div className="lh center">Reserva em</div>
                      <div className="lh center">Pagamento</div>
                    </div>

                    <div className="listBody">
                      {filteredBackupEntries.length ? (
                        filteredBackupEntries.map(({ n, e }) => {
                          const paid = !!e.paid
                          return (
                            <div key={n} className="listRow home">
                              <div className="lc num center">{n}</div>
                              <div className="lc nameCell" title={e.name}>
                                {e.name}
                              </div>
                              <div className="lc whenCell center mono">{formatWhen(e.reservedAt)}</div>
                              <div className="lc payCell center">
                                <div className={'payPill ' + (paid ? 'pillPaid' : 'pillPending')}>
                                  <TbBrandCashapp className={'cashIcon ' + (paid ? 'cashPaid' : 'cashPending')} />
                                  <span className="payText">{paid ? 'Pago' : 'Não Pago'}</span>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <div className="empty">Nenhum item para mostrar</div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty">Selecione um backup para visualizar</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="backRow">
        <button className="btn" onClick={() => nav('/admin')}>
          Voltar
        </button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/data" element={<DataAdminPage />} />
    </Routes>
  )
}
