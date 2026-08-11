/**
 * Seed the local development API with demo clinic data.
 *
 *   bun run scripts/seed-demo.ts
 *
 * Every record it creates is fictional and is tagged so it can be told apart
 * from real data. The script is idempotent: it looks for an existing record by
 * a natural key before creating anything, so running it twice is safe.
 *
 * This talks to the API exactly as the browser does — session cookie plus the
 * double-submit CSRF header — so it also serves as an end-to-end check that
 * the auth wiring works.
 *
 * It writes to whatever API `API` points at. Do not run it against production.
 */

const API = process.env.SEED_API_URL ?? 'http://localhost:8000/api/v1'
const USERNAME = process.env.SEED_USERNAME ?? 'admin'
const PASSWORD = process.env.SEED_PASSWORD ?? '00'
/** Create the demo prescriptions and appointments even if some already exist. */
const FORCE = process.env.SEED_FORCE === '1'

/* ---------------------------- tiny cookie jar ----------------------------- */

const jar = new Map<string, string>()

function storeCookies(response: Response) {
  const raw = response.headers.getSetCookie?.() ?? []
  for (const line of raw) {
    const [pair] = line.split(';')
    const eq = pair?.indexOf('=') ?? -1
    if (!pair || eq < 1) continue
    jar.set(pair.slice(0, eq), pair.slice(eq + 1))
  }
}

function cookieHeader(): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const cookies = cookieHeader()
  if (cookies) headers.Cookie = cookies
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  // Every write needs the CSRF token echoed from the cookie.
  if (method !== 'GET') {
    const token = jar.get('ortho_csrf')
    if (token) headers['X-CSRF-Token'] = decodeURIComponent(token)
  }

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  storeCookies(response)

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 400)}`)
  }
  return (text ? JSON.parse(text) : null) as T
}

const get = <T,>(path: string) => call<T>('GET', path)
const post = <T,>(path: string, body: unknown) => call<T>('POST', path, body)

/* --------------------------------- data ---------------------------------- */

interface Identified {
  id: string
}

const MEDICINES = [
  { name: 'Etoricoxib 90', generic_name: 'Etoricoxib', brand_name: 'Nucoxia', dosage_form: 'tablet', strength: '90 mg', category: 'NSAID', manufacturer: 'Zydus' },
  { name: 'Aceclofenac 100', generic_name: 'Aceclofenac', brand_name: 'Zerodol', dosage_form: 'tablet', strength: '100 mg', category: 'NSAID', manufacturer: 'Ipca' },
  { name: 'Diclofenac 50', generic_name: 'Diclofenac Sodium', brand_name: 'Voveran', dosage_form: 'tablet', strength: '50 mg', category: 'NSAID', manufacturer: 'Novartis' },
  { name: 'Naproxen 500', generic_name: 'Naproxen', brand_name: 'Naprosyn', dosage_form: 'tablet', strength: '500 mg', category: 'NSAID', manufacturer: 'RPG' },
  { name: 'Paracetamol 650', generic_name: 'Paracetamol', brand_name: 'Dolo', dosage_form: 'tablet', strength: '650 mg', category: 'Analgesic', manufacturer: 'Micro Labs' },
  { name: 'Tramadol 50', generic_name: 'Tramadol', brand_name: 'Ultracet', dosage_form: 'tablet', strength: '50 mg', category: 'Opioid analgesic', manufacturer: 'Janssen' },
  { name: 'Pantoprazole 40', generic_name: 'Pantoprazole', brand_name: 'Pantocid', dosage_form: 'tablet', strength: '40 mg', category: 'Gastroprotective', manufacturer: 'Sun Pharma' },
  { name: 'Calcium + Vitamin D3', generic_name: 'Calcium Carbonate + Cholecalciferol', brand_name: 'Shelcal', dosage_form: 'tablet', strength: '500 mg / 250 IU', category: 'Supplement', manufacturer: 'Torrent' },
  { name: 'Vitamin D3 60K', generic_name: 'Cholecalciferol', brand_name: 'Uprise D3', dosage_form: 'capsule', strength: '60000 IU', category: 'Supplement', manufacturer: 'Alkem' },
  { name: 'Methylcobalamin 1500', generic_name: 'Methylcobalamin', brand_name: 'Nurokind', dosage_form: 'tablet', strength: '1500 mcg', category: 'Neurotropic', manufacturer: 'Mankind' },
  { name: 'Thiocolchicoside 4', generic_name: 'Thiocolchicoside', brand_name: 'Myoril', dosage_form: 'capsule', strength: '4 mg', category: 'Muscle relaxant', manufacturer: 'Sanofi' },
  { name: 'Chlorzoxazone 250', generic_name: 'Chlorzoxazone', brand_name: 'Nucoxia MR', dosage_form: 'tablet', strength: '250 mg', category: 'Muscle relaxant', manufacturer: 'Zydus' },
  { name: 'Diclofenac Gel', generic_name: 'Diclofenac Diethylamine', brand_name: 'Volini', dosage_form: 'ointment', strength: '1.16% w/w', category: 'Topical NSAID', manufacturer: 'Sun Pharma' },
  { name: 'Glucosamine 750', generic_name: 'Glucosamine Sulphate', brand_name: 'Joinace', dosage_form: 'tablet', strength: '750 mg', category: 'Chondroprotective', manufacturer: 'Zydus' },
] as const

const PATIENTS = [
  { first_name: 'Ranjit', last_name: 'Sharma', phone: '9830012001', gender: 'male', date_of_birth: '1962-04-11', city: 'Kolkata', blood_group: 'B+', allergies: ['Diclofenac', 'Sulfa drugs'] },
  { first_name: 'Anita', last_name: 'Bose', phone: '9830012002', gender: 'female', date_of_birth: '1975-09-22', city: 'Kolkata', blood_group: 'O+', allergies: [] },
  { first_name: 'Mohammed', last_name: 'Iqbal', phone: '9830012003', gender: 'male', date_of_birth: '1988-01-30', city: 'Howrah', blood_group: 'A+', allergies: ['Penicillin'] },
  { first_name: 'Sunita', last_name: 'Devi', phone: '9830012004', gender: 'female', date_of_birth: '1954-12-05', city: 'Kolkata', blood_group: 'AB+', allergies: ['NSAIDs'] },
  { first_name: 'Debashish', last_name: 'Roy', phone: '9830012005', gender: 'male', date_of_birth: '1970-07-18', city: 'Salt Lake', blood_group: 'B-', allergies: [] },
  { first_name: 'Priya', last_name: 'Chatterjee', phone: '9830012006', gender: 'female', date_of_birth: '1993-03-14', city: 'Kolkata', blood_group: 'O-', allergies: [] },
  { first_name: 'Arun', last_name: 'Mukherjee', phone: '9830012007', gender: 'male', date_of_birth: '1948-11-02', city: 'Barrackpore', blood_group: 'A-', allergies: ['Tramadol'] },
  { first_name: 'Kavita', last_name: 'Singh', phone: '9830012008', gender: 'female', date_of_birth: '1981-06-27', city: 'Kolkata', blood_group: 'B+', allergies: [] },
] as const

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

/* --------------------------------- main ---------------------------------- */

async function main() {
  console.log(`Seeding demo data into ${API}`)

  await post('/auth/login', { username: USERNAME, password: PASSWORD })
  const me = await get<{ username: string; role: string }>('/auth/me')
  console.log(`  signed in as ${me.username} (${me.role})`)

  /* ------------------------------ medicines ----------------------------- */
  const medicineIds = new Map<string, string>()
  let createdMedicines = 0
  for (const medicine of MEDICINES) {
    const existing = await get<Identified[]>(
      `/medicines/search?q=${encodeURIComponent(medicine.name)}&limit=5`,
    )
    const match = (existing as unknown as { id: string; name: string }[]).find(
      (m) => m.name === medicine.name,
    )
    if (match) {
      medicineIds.set(medicine.name, match.id)
      continue
    }
    const created = await post<Identified>('/medicines', {
      ...medicine,
      description: 'Demo formulary entry.',
    })
    medicineIds.set(medicine.name, created.id)
    createdMedicines++
  }
  console.log(`  medicines: ${createdMedicines} created, ${MEDICINES.length - createdMedicines} already present`)

  /* ------------------------------- patients ----------------------------- */
  const patientIds = new Map<string, string>()
  let createdPatients = 0
  for (const patient of PATIENTS) {
    const existing = await get<{ id: string; phone: string }[]>(
      `/patients/search?q=${encodeURIComponent(patient.phone)}&limit=5`,
    )
    const match = existing.find((p) => p.phone === patient.phone)
    if (match) {
      patientIds.set(patient.phone, match.id)
      continue
    }
    const created = await post<Identified>('/patients', {
      ...patient,
      allergies: [...patient.allergies],
      address: 'Demo address — seeded record',
    })
    patientIds.set(patient.phone, created.id)
    createdPatients++
  }
  console.log(`  patients: ${createdPatients} created, ${PATIENTS.length - createdPatients} already present`)

  /* ---------------------------- prescriptions --------------------------- */
  const existingRx = await get<{ total: number }>('/prescriptions?page=1&page_size=1')
  if (existingRx.total > 0 && !FORCE) {
    console.log(`  prescriptions: ${existingRx.total} already present, skipping`)
  } else {
    const med = (name: string) => {
      const id = medicineIds.get(name)
      if (!id) throw new Error(`medicine not seeded: ${name}`)
      return id
    }

    const scripts = [
      {
        phone: '9830012001',
        diagnosis: 'Osteoarthritis, right knee (Grade 2)',
        chief_complaint: 'Right knee pain on climbing stairs, six months',
        advice: 'Avoid squatting and cross-legged sitting\nHot fomentation twice daily\nQuadriceps strengthening as demonstrated',
        follow_up_date: isoDate(14),
        items: [
          { medicine_id: med('Etoricoxib 90'), dosage: '1 tab', frequency: '1-0-0', duration_days: 10, quantity: 10, instructions: 'After food' },
          { medicine_id: med('Pantoprazole 40'), dosage: '1 tab', frequency: '1-0-0', duration_days: 10, quantity: 10, instructions: 'Before breakfast' },
          { medicine_id: med('Calcium + Vitamin D3'), dosage: '1 tab', frequency: '0-0-1', duration_days: 30, quantity: 30, instructions: 'After food' },
        ],
      },
      {
        phone: '9830012004',
        diagnosis: 'Post-menopausal osteoporosis',
        chief_complaint: 'Generalised body ache, low back pain',
        advice: 'Twenty minutes of morning sunlight daily\nWeight-bearing walking as tolerated',
        follow_up_date: isoDate(30),
        items: [
          { medicine_id: med('Vitamin D3 60K'), dosage: '1 cap', frequency: '1-0-0', duration_days: 56, quantity: 8, instructions: 'Once weekly, after food' },
          { medicine_id: med('Calcium + Vitamin D3'), dosage: '1 tab', frequency: '1-0-1', duration_days: 60, quantity: 120, instructions: 'After food' },
          { medicine_id: med('Paracetamol 650'), dosage: '1 tab', frequency: '1-0-1', duration_days: 5, quantity: 10, instructions: 'Only if pain' },
        ],
      },
      {
        phone: '9830012003',
        diagnosis: 'Acute lumbar spondylosis with muscle spasm',
        chief_complaint: 'Low back pain after lifting, three days',
        advice: 'Bed rest on a firm mattress for two days\nNo forward bending or lifting',
        follow_up_date: isoDate(7),
        items: [
          { medicine_id: med('Aceclofenac 100'), dosage: '1 tab', frequency: '1-0-1', duration_days: 5, quantity: 10, instructions: 'After food' },
          { medicine_id: med('Thiocolchicoside 4'), dosage: '1 cap', frequency: '1-0-1', duration_days: 5, quantity: 10, instructions: 'After food' },
          { medicine_id: med('Pantoprazole 40'), dosage: '1 tab', frequency: '1-0-0', duration_days: 5, quantity: 5, instructions: 'Before breakfast' },
          { medicine_id: med('Diclofenac Gel'), dosage: 'Apply locally', frequency: '1-1-1', duration_days: 7, quantity: 1, instructions: 'Massage gently over the painful area' },
        ],
      },
      {
        phone: '9830012007',
        diagnosis: 'Cervical radiculopathy, C5–C6',
        chief_complaint: 'Neck pain radiating to the left arm with tingling',
        advice: 'Cervical collar while travelling\nAvoid prolonged phone use\nIsometric neck exercises',
        follow_up_date: isoDate(21),
        items: [
          { medicine_id: med('Methylcobalamin 1500'), dosage: '1 tab', frequency: '1-0-0', duration_days: 30, quantity: 30, instructions: 'After breakfast' },
          { medicine_id: med('Naproxen 500'), dosage: '1 tab', frequency: '1-0-1', duration_days: 7, quantity: 14, instructions: 'After food' },
        ],
      },
    ]

    for (const script of scripts) {
      const patientId = patientIds.get(script.phone)
      if (!patientId) continue
      const { phone: _phone, ...rest } = script
      await post('/prescriptions', { patient_id: patientId, ...rest })
    }
    console.log(`  prescriptions: ${scripts.length} created`)
  }

  /* ----------------------------- appointments --------------------------- */
  const today = isoDate(0)
  const existingToday = await get<{ total: number }>(
    `/appointments?from_date=${today}&to_date=${today}&page=1&page_size=1`,
  )
  if (existingToday.total > 0 && !FORCE) {
    console.log(`  appointments: ${existingToday.total} already booked today, skipping`)
  } else {
    // The clinic only sits on certain days and hours, and the API refuses
    // anything outside them. So ask which slots are actually free rather than
    // inventing times — that is also what the booking UI does.
    const wanted = [
      { phone: '9830012001', reason: 'Knee pain review' },
      { phone: '9830012002', reason: 'Shoulder stiffness' },
      { phone: '9830012006', reason: 'Ankle sprain follow-up' },
      { phone: '9830012005', reason: 'Back pain, first visit' },
      { phone: '9830012008', reason: 'Wrist pain' },
      { phone: '9830012003', reason: 'Lumbar spondylosis review' },
    ]

    interface Slot {
      date: string
      start_time: string
      status: string
    }

    // Collect free slots across the next fortnight, in chronological order.
    const free: Slot[] = []
    for (let offset = 0; offset < 14 && free.length < wanted.length * 2; offset++) {
      const date = isoDate(offset)
      const slots = await get<Slot[]>(`/appointments/slots?date=${date}`)
      free.push(...slots.filter((s) => s.status === 'available'))
    }

    if (free.length === 0) {
      console.log('  appointments: no free slots in the next fortnight — check availability')
    } else {
      let booked = 0
      for (const [index, entry] of wanted.entries()) {
        const patientId = patientIds.get(entry.phone)
        const slot = free[index]
        if (!patientId || !slot) continue
        try {
          await post('/appointments', {
            patient_id: patientId,
            appointment_date: slot.date,
            start_time: slot.start_time,
            reason: entry.reason,
          })
          booked++
        } catch (error) {
          console.log(
            `    skipped ${slot.date} ${slot.start_time}: ${(error as Error).message.slice(0, 140)}`,
          )
        }
      }
      console.log(`  appointments: ${booked} booked`)
    }
  }

  console.log('Done.')
}

main().catch((error: unknown) => {
  console.error('\nSeeding failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
