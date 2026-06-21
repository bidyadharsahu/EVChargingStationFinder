import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  MapPin, Zap, Search, Navigation, X, RefreshCw, ChevronDown,
  ExternalLink, AlertCircle, Loader2, Leaf,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OCMStation {
  ID: number;
  AddressInfo: {
    Title: string;
    AddressLine1?: string;
    Town?: string;
    Postcode?: string;
    Country?: { ISOCode: string; Title: string };
    Latitude: number;
    Longitude: number;
    Distance?: number;
  };
  Connections?: Array<{
    ConnectionType?: { ID: number; Title: string };
    PowerKW?: number;
    StatusType?: { IsOperational: boolean; Title: string };
  }>;
  StatusType?: { IsOperational: boolean; Title: string } | null;
  OperatorInfo?: { Title: string } | null;
  UsageCost?: string | null;
}

interface EthanolStation {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  blends: string[];
  operator: string;
  lat: number;
  lng: number;
  open24h: boolean;
}

interface GeoResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
}

type FuelMode = "ev" | "ethanol";
type AppStep = "initial" | "requesting" | "denied" | "loaded" | "error";
type MapAction = { lat: number; lng: number; zoom?: number } | null;

// ── Ethanol Station Data — 14 major Indian cities ──────────────────────────────

const ETHANOL_PUMPS: Record<string, EthanolStation[]> = {
  Delhi: [
    { id: "d1", name: "IOCL Connaught Place", address: "Parliament Street, Connaught Place, New Delhi 110001", city: "Delhi", state: "Delhi", blends: ["E20", "E10"], operator: "IOCL", lat: 28.6329, lng: 77.2195, open24h: true },
    { id: "d2", name: "BPCL Karol Bagh", address: "Ajmal Khan Road, Karol Bagh, Delhi 110005", city: "Delhi", state: "Delhi", blends: ["E20"], operator: "BPCL", lat: 28.6517, lng: 77.1907, open24h: false },
    { id: "d3", name: "HPCL Lajpat Nagar", address: "Ring Road, Lajpat Nagar, New Delhi 110024", city: "Delhi", state: "Delhi", blends: ["E20", "E10"], operator: "HPCL", lat: 28.5671, lng: 77.2431, open24h: true },
    { id: "d4", name: "IOCL Dwarka Sector 10", address: "Sector 10, Dwarka, New Delhi 110075", city: "Delhi", state: "Delhi", blends: ["E20", "E85"], operator: "IOCL", lat: 28.5892, lng: 77.0466, open24h: true },
    { id: "d5", name: "HPCL Rohini Sector 7", address: "Sector 7, Rohini, Delhi 110085", city: "Delhi", state: "Delhi", blends: ["E20"], operator: "HPCL", lat: 28.7141, lng: 77.1025, open24h: false },
    { id: "d6", name: "BPCL Saket District Centre", address: "District Centre, Saket, New Delhi 110017", city: "Delhi", state: "Delhi", blends: ["E20", "E85"], operator: "BPCL", lat: 28.5244, lng: 77.2167, open24h: true },
    { id: "d7", name: "IOCL Noida Sector 18", address: "Sector 18, Noida, Uttar Pradesh 201301", city: "Delhi", state: "UP", blends: ["E20", "E85", "E10"], operator: "IOCL", lat: 28.5706, lng: 77.3219, open24h: true },
    { id: "d8", name: "HPCL Gurugram Sohna Road", address: "Sohna Road, Sector 47, Gurugram 122018", city: "Delhi", state: "Haryana", blends: ["E20"], operator: "HPCL", lat: 28.4595, lng: 77.0266, open24h: false },
  ],
  Mumbai: [
    { id: "m1", name: "IOCL Bandra West", address: "Linking Road, Bandra West, Mumbai 400050", city: "Mumbai", state: "Maharashtra", blends: ["E20", "E10"], operator: "IOCL", lat: 19.0600, lng: 72.8377, open24h: true },
    { id: "m2", name: "BPCL Andheri East", address: "MIDC, Andheri East, Mumbai 400093", city: "Mumbai", state: "Maharashtra", blends: ["E20", "E85"], operator: "BPCL", lat: 19.1136, lng: 72.8697, open24h: true },
    { id: "m3", name: "HPCL Powai", address: "LBS Marg, Powai, Mumbai 400076", city: "Mumbai", state: "Maharashtra", blends: ["E20"], operator: "HPCL", lat: 19.1197, lng: 72.9048, open24h: false },
    { id: "m4", name: "IOCL Lower Parel", address: "Senapati Bapat Marg, Lower Parel, Mumbai 400013", city: "Mumbai", state: "Maharashtra", blends: ["E20", "E85"], operator: "IOCL", lat: 18.9985, lng: 72.8291, open24h: true },
    { id: "m5", name: "BPCL Thane West", address: "Gokhale Road, Thane West 400602", city: "Mumbai", state: "Maharashtra", blends: ["E20"], operator: "BPCL", lat: 19.2183, lng: 72.9781, open24h: false },
    { id: "m6", name: "HPCL Vashi Navi Mumbai", address: "Sector 17, Vashi, Navi Mumbai 400703", city: "Mumbai", state: "Maharashtra", blends: ["E20", "E100"], operator: "HPCL", lat: 19.0771, lng: 73.0024, open24h: true },
    { id: "m7", name: "Nayara Energy Borivali West", address: "S.V. Road, Borivali West, Mumbai 400092", city: "Mumbai", state: "Maharashtra", blends: ["E20"], operator: "Nayara", lat: 19.2307, lng: 72.8567, open24h: false },
  ],
  Bangalore: [
    { id: "b1", name: "IOCL Koramangala 5th Block", address: "80 Feet Road, Koramangala, Bangalore 560034", city: "Bangalore", state: "Karnataka", blends: ["E20", "E10"], operator: "IOCL", lat: 12.9349, lng: 77.6265, open24h: true },
    { id: "b2", name: "BPCL Whitefield Main Road", address: "ITPL Main Road, Whitefield, Bangalore 560066", city: "Bangalore", state: "Karnataka", blends: ["E20", "E85"], operator: "BPCL", lat: 12.9698, lng: 77.7499, open24h: true },
    { id: "b3", name: "HPCL Electronic City Phase 1", address: "Hosur Main Road, Electronic City, Bangalore 560100", city: "Bangalore", state: "Karnataka", blends: ["E20"], operator: "HPCL", lat: 12.8467, lng: 77.6651, open24h: false },
    { id: "b4", name: "IOCL Marathahalli", address: "Marathahalli Junction, Outer Ring Road, Bangalore 560037", city: "Bangalore", state: "Karnataka", blends: ["E20", "E85"], operator: "IOCL", lat: 12.9591, lng: 77.6971, open24h: true },
    { id: "b5", name: "BPCL JP Nagar 4th Phase", address: "Bannerghatta Road, JP Nagar, Bangalore 560078", city: "Bangalore", state: "Karnataka", blends: ["E20"], operator: "BPCL", lat: 12.9130, lng: 77.5950, open24h: false },
    { id: "b6", name: "HPCL Hebbal Flyover", address: "NH 44, Hebbal, Bangalore 560024", city: "Bangalore", state: "Karnataka", blends: ["E20"], operator: "HPCL", lat: 13.0358, lng: 77.5924, open24h: true },
  ],
  Chennai: [
    { id: "c1", name: "IOCL Anna Nagar West", address: "Anna Nagar West, Chennai 600040", city: "Chennai", state: "Tamil Nadu", blends: ["E20", "E10"], operator: "IOCL", lat: 13.0850, lng: 80.2101, open24h: true },
    { id: "c2", name: "BPCL T Nagar Pondy Bazaar", address: "Pondy Bazaar, T Nagar, Chennai 600017", city: "Chennai", state: "Tamil Nadu", blends: ["E20"], operator: "BPCL", lat: 13.0418, lng: 80.2341, open24h: false },
    { id: "c3", name: "HPCL Velachery Main Road", address: "Velachery Main Road, Velachery, Chennai 600042", city: "Chennai", state: "Tamil Nadu", blends: ["E20", "E85"], operator: "HPCL", lat: 12.9815, lng: 80.2209, open24h: true },
    { id: "c4", name: "IOCL Perungudi IT Corridor", address: "OMR, Perungudi, Chennai 600096", city: "Chennai", state: "Tamil Nadu", blends: ["E20", "E85"], operator: "IOCL", lat: 12.9671, lng: 80.2375, open24h: true },
    { id: "c5", name: "BPCL Tambaram Main Road", address: "Tambaram Main Road, Tambaram, Chennai 600045", city: "Chennai", state: "Tamil Nadu", blends: ["E20"], operator: "BPCL", lat: 12.9249, lng: 80.1000, open24h: false },
  ],
  Pune: [
    { id: "p1", name: "IOCL Kothrud Depot Road", address: "Depot Road, Kothrud, Pune 411038", city: "Pune", state: "Maharashtra", blends: ["E20", "E85", "E10"], operator: "IOCL", lat: 18.5080, lng: 73.8154, open24h: true },
    { id: "p2", name: "BPCL Wakad Hinjewadi Road", address: "Hinjewadi Road, Wakad, Pune 411057", city: "Pune", state: "Maharashtra", blends: ["E20"], operator: "BPCL", lat: 18.5999, lng: 73.7608, open24h: false },
    { id: "p3", name: "HPCL Hadapsar Solapur Road", address: "Solapur Road, Hadapsar, Pune 411028", city: "Pune", state: "Maharashtra", blends: ["E20", "E85"], operator: "HPCL", lat: 18.5070, lng: 73.9371, open24h: true },
    { id: "p4", name: "IOCL Viman Nagar", address: "Nagar Road, Viman Nagar, Pune 411014", city: "Pune", state: "Maharashtra", blends: ["E20"], operator: "IOCL", lat: 18.5679, lng: 73.9143, open24h: true },
    { id: "p5", name: "BPCL Baner Pashan Road", address: "Pashan Road, Baner, Pune 411045", city: "Pune", state: "Maharashtra", blends: ["E20"], operator: "BPCL", lat: 18.5590, lng: 73.7853, open24h: false },
  ],
  Hyderabad: [
    { id: "h1", name: "IOCL Banjara Hills Rd No. 12", address: "Road No. 12, Banjara Hills, Hyderabad 500034", city: "Hyderabad", state: "Telangana", blends: ["E20", "E85"], operator: "IOCL", lat: 17.4126, lng: 78.4483, open24h: true },
    { id: "h2", name: "BPCL Gachibowli Stadium Road", address: "Stadium Road, Gachibowli, Hyderabad 500032", city: "Hyderabad", state: "Telangana", blends: ["E20", "E10"], operator: "BPCL", lat: 17.4401, lng: 78.3489, open24h: true },
    { id: "h3", name: "HPCL Kondapur Main Road", address: "Kondapur Main Road, Kondapur, Hyderabad 500084", city: "Hyderabad", state: "Telangana", blends: ["E20"], operator: "HPCL", lat: 17.4604, lng: 78.3574, open24h: false },
    { id: "h4", name: "IOCL Kukatpally Housing Board", address: "KPHB Colony, Kukatpally, Hyderabad 500072", city: "Hyderabad", state: "Telangana", blends: ["E20", "E85"], operator: "IOCL", lat: 17.4849, lng: 78.3955, open24h: true },
    { id: "h5", name: "BPCL Secunderabad Trimulgherry", address: "Trimulgherry, Secunderabad 500015", city: "Hyderabad", state: "Telangana", blends: ["E20"], operator: "BPCL", lat: 17.4399, lng: 78.4983, open24h: false },
  ],
  Kolkata: [
    { id: "k1", name: "IOCL Park Street", address: "Park Street, Kolkata 700016", city: "Kolkata", state: "West Bengal", blends: ["E20", "E10"], operator: "IOCL", lat: 22.5524, lng: 88.3519, open24h: true },
    { id: "k2", name: "BPCL Salt Lake Sector V", address: "Sector V, Salt Lake, Kolkata 700091", city: "Kolkata", state: "West Bengal", blends: ["E20", "E85"], operator: "BPCL", lat: 22.5800, lng: 88.4079, open24h: true },
    { id: "k3", name: "HPCL Dum Dum Airport Road", address: "Airport Road, Dum Dum, Kolkata 700028", city: "Kolkata", state: "West Bengal", blends: ["E20"], operator: "HPCL", lat: 22.6423, lng: 88.3957, open24h: false },
    { id: "k4", name: "IOCL New Town Rajarhat", address: "Action Area I, New Town, Kolkata 700156", city: "Kolkata", state: "West Bengal", blends: ["E20"], operator: "IOCL", lat: 22.5815, lng: 88.4707, open24h: true },
  ],
  Ahmedabad: [
    { id: "a1", name: "IOCL Navrangpura C G Road", address: "C G Road, Navrangpura, Ahmedabad 380009", city: "Ahmedabad", state: "Gujarat", blends: ["E20", "E10"], operator: "IOCL", lat: 23.0345, lng: 72.5620, open24h: true },
    { id: "a2", name: "BPCL Vastrapur Lake Road", address: "Vastrapur Lake Road, Vastrapur, Ahmedabad 380015", city: "Ahmedabad", state: "Gujarat", blends: ["E20", "E85"], operator: "BPCL", lat: 23.0386, lng: 72.5281, open24h: false },
    { id: "a3", name: "HPCL Satellite Road", address: "Satellite Road, Satellite, Ahmedabad 380015", city: "Ahmedabad", state: "Gujarat", blends: ["E20"], operator: "HPCL", lat: 23.0267, lng: 72.5079, open24h: true },
    { id: "a4", name: "IOCL Chandkheda Highway", address: "Gandhinagar Highway, Chandkheda, Ahmedabad 382424", city: "Ahmedabad", state: "Gujarat", blends: ["E20"], operator: "IOCL", lat: 23.1047, lng: 72.5848, open24h: true },
  ],
  Lucknow: [
    { id: "l1", name: "IOCL Hazratganj Vidhan Sabha Road", address: "Vidhan Sabha Marg, Hazratganj, Lucknow 226001", city: "Lucknow", state: "Uttar Pradesh", blends: ["E20", "E100", "E85"], operator: "IOCL", lat: 26.8488, lng: 80.9462, open24h: true },
    { id: "l2", name: "BPCL Gomti Nagar Viram Khand", address: "Viram Khand 1, Gomti Nagar, Lucknow 226010", city: "Lucknow", state: "Uttar Pradesh", blends: ["E20", "E10"], operator: "BPCL", lat: 26.8469, lng: 80.9984, open24h: false },
    { id: "l3", name: "HPCL Alambagh Bus Stand", address: "Kanpur Road, Alambagh, Lucknow 226005", city: "Lucknow", state: "Uttar Pradesh", blends: ["E20"], operator: "HPCL", lat: 26.8103, lng: 80.9113, open24h: true },
    { id: "l4", name: "IOCL Indira Nagar Faizabad Road", address: "Faizabad Road, Indira Nagar, Lucknow 226016", city: "Lucknow", state: "Uttar Pradesh", blends: ["E20", "E85"], operator: "IOCL", lat: 26.8832, lng: 81.0011, open24h: false },
  ],
  Jaipur: [
    { id: "j1", name: "IOCL MI Road Gandhi Nagar", address: "MI Road, Gandhi Nagar, Jaipur 302015", city: "Jaipur", state: "Rajasthan", blends: ["E20", "E10"], operator: "IOCL", lat: 26.9186, lng: 75.7952, open24h: true },
    { id: "j2", name: "BPCL Vaishali Nagar", address: "Vaishali Nagar, Jaipur 302021", city: "Jaipur", state: "Rajasthan", blends: ["E20", "E85"], operator: "BPCL", lat: 26.9338, lng: 75.7412, open24h: false },
    { id: "j3", name: "HPCL Malviya Nagar JLN Road", address: "JLN Road, Malviya Nagar, Jaipur 302017", city: "Jaipur", state: "Rajasthan", blends: ["E20"], operator: "HPCL", lat: 26.8584, lng: 75.8073, open24h: true },
    { id: "j4", name: "IOCL Mansarovar Vidhyadhar Nagar", address: "Vidhyadhar Nagar, Mansarovar, Jaipur 302020", city: "Jaipur", state: "Rajasthan", blends: ["E20"], operator: "IOCL", lat: 26.8607, lng: 75.7627, open24h: false },
  ],
  Chandigarh: [
    { id: "ch1", name: "IOCL Sector 17 Plaza", address: "Sector 17 B, Chandigarh 160017", city: "Chandigarh", state: "Chandigarh", blends: ["E20", "E10"], operator: "IOCL", lat: 30.7411, lng: 76.7879, open24h: true },
    { id: "ch2", name: "BPCL Sector 34 Phase", address: "Sector 34 A, Chandigarh 160022", city: "Chandigarh", state: "Chandigarh", blends: ["E20", "E85"], operator: "BPCL", lat: 30.7218, lng: 76.7897, open24h: false },
    { id: "ch3", name: "HPCL Mohali Phase 10", address: "Phase 10, Mohali, Punjab 160062", city: "Chandigarh", state: "Punjab", blends: ["E20"], operator: "HPCL", lat: 30.7046, lng: 76.7179, open24h: true },
  ],
  Nagpur: [
    { id: "n1", name: "IOCL Sitabuldi Main Road", address: "Main Road, Sitabuldi, Nagpur 440012", city: "Nagpur", state: "Maharashtra", blends: ["E20", "E85", "E10"], operator: "IOCL", lat: 21.1517, lng: 79.0820, open24h: true },
    { id: "n2", name: "BPCL Dharampeth VCA Ground", address: "VCA Ground Road, Dharampeth, Nagpur 440010", city: "Nagpur", state: "Maharashtra", blends: ["E20"], operator: "BPCL", lat: 21.1497, lng: 79.0618, open24h: false },
    { id: "n3", name: "HPCL Hingna MIDC Road", address: "MIDC Road, Hingna, Nagpur 440016", city: "Nagpur", state: "Maharashtra", blends: ["E20"], operator: "HPCL", lat: 21.1014, lng: 79.0113, open24h: true },
  ],
  Indore: [
    { id: "in1", name: "IOCL Vijay Nagar Square", address: "Vijay Nagar Square, Indore 452010", city: "Indore", state: "Madhya Pradesh", blends: ["E20", "E85", "E10"], operator: "IOCL", lat: 22.7435, lng: 75.8853, open24h: true },
    { id: "in2", name: "BPCL Scheme 54 AB Road", address: "AB Road, Scheme 54, Indore 452010", city: "Indore", state: "Madhya Pradesh", blends: ["E20"], operator: "BPCL", lat: 22.7515, lng: 75.9030, open24h: false },
    { id: "in3", name: "HPCL LIG Colony Square", address: "LIG Colony, Indore 452001", city: "Indore", state: "Madhya Pradesh", blends: ["E20"], operator: "HPCL", lat: 22.7143, lng: 75.8560, open24h: true },
  ],
  Bhopal: [
    { id: "bp1", name: "IOCL Arera Colony Zone 1", address: "Zone 1, Arera Colony, Bhopal 462016", city: "Bhopal", state: "Madhya Pradesh", blends: ["E20", "E10"], operator: "IOCL", lat: 23.2034, lng: 77.4343, open24h: true },
    { id: "bp2", name: "BPCL MP Nagar Zone 1", address: "Zone 1, MP Nagar, Bhopal 462011", city: "Bhopal", state: "Madhya Pradesh", blends: ["E20"], operator: "BPCL", lat: 23.2320, lng: 77.4238, open24h: false },
    { id: "bp3", name: "HPCL Kolar Road", address: "Kolar Road, Bhopal 462042", city: "Bhopal", state: "Madhya Pradesh", blends: ["E20", "E85"], operator: "HPCL", lat: 23.2106, lng: 77.4661, open24h: true },
  ],
};

const ETHANOL_CITY_CENTERS: Record<string, [number, number]> = {
  Delhi: [28.6139, 77.2090], Mumbai: [19.0760, 72.8777], Bangalore: [12.9716, 77.5946],
  Chennai: [13.0827, 80.2707], Pune: [18.5204, 73.8567], Hyderabad: [17.3850, 78.4867],
  Kolkata: [22.5726, 88.3639], Ahmedabad: [23.0225, 72.5714], Lucknow: [26.8467, 80.9462],
  Jaipur: [26.9124, 75.7873], Chandigarh: [30.7333, 76.7794], Nagpur: [21.1458, 79.0882],
  Indore: [22.7196, 75.8577], Bhopal: [23.2599, 77.4126],
};

const INDIA_CITIES = Object.keys(ETHANOL_PUMPS);

const BLEND_INFO = [
  { id: "E20", label: "E20", name: "Petrol + 20% Ethanol", color: "#4ADE80", govtTarget: "Mandatory by Apr 2025", compatible: "All BS6 petrol vehicles (2020+)", mileageAdj: -5, co2Save: 7, blendCostFactor: 0.95, available: "15 states · IOCL / BPCL / HPCL", icon: "🟢", desc: "India's national mandate. 20% ethanol mixed with 80% petrol. Works in every modern petrol car without any modification. Slightly lower mileage (~5%) but saves money per litre. Key first step in India's biofuel mission." },
  { id: "E50", label: "E50", name: "Petrol + 50% Ethanol", color: "#22C55E", govtTarget: "Flex-fuel rollout phase", compatible: "Flex-fuel capable vehicles", mileageAdj: -14, co2Save: 33, blendCostFactor: 0.77, available: "Pilot stations · select cities", icon: "🟩", desc: "50% ethanol blend requiring engine calibration for optimal performance. Significant CO2 savings. India is piloting this through select IOCL outlets, primarily for flex-fuel two-wheelers from TVS and Bajaj." },
  { id: "E85", label: "E85", name: "Petrol + 85% Ethanol", color: "#16A34A", govtTarget: "Flex-fuel mandate by 2025", compatible: "Flex-fuel vehicles (FFV) only", mileageAdj: -28, co2Save: 64, blendCostFactor: 0.61, available: "Limited · pilot pumps", icon: "🟢", desc: "High-ethanol flex-fuel. Requires a specially certified Flex-Fuel Vehicle. India's first E85 two-wheelers launched by TVS and Bajaj in 2023. Toyota and Suzuki have showcased E85 FFV prototypes for India." },
  { id: "E100", label: "E100", name: "100% Ethanol", color: "#15803D", govtTarget: "Pilot / NTPC demonstration", compatible: "Dedicated ethanol engines", mileageAdj: -34, co2Save: 80, blendCostFactor: 0.55, available: "Extremely limited · UP & MH pilot", icon: "💚", desc: "Pure ethanol fuel. Brazil runs on this nationwide. India is piloting E100 through IOCL in Uttar Pradesh and Maharashtra. Requires specially designed engines. PM Modi launched India's first E100 pilot at Pune in 2021." },
];

// ── EV Constants ───────────────────────────────────────────────────────────────

const CONNECTOR_COLORS: Record<string, string> = {
  CCS: "#3DBAFF", CHAdeMO: "#FF8A3D", "Type 2": "#A855F7", "J1772": "#22D3EE", NACS: "#C2FF3D",
};

const EV_MODELS = [
  { id: "tesla-3-lr", name: "Model 3 Long Range", brand: "Tesla", rangeKm: 602, batteryKwh: 82 },
  { id: "tesla-y-lr", name: "Model Y Long Range", brand: "Tesla", rangeKm: 533, batteryKwh: 82 },
  { id: "tesla-s", name: "Model S", brand: "Tesla", rangeKm: 652, batteryKwh: 100 },
  { id: "ioniq-5", name: "IONIQ 5 Long Range", brand: "Hyundai", rangeKm: 507, batteryKwh: 77.4 },
  { id: "ioniq-6", name: "IONIQ 6 Long Range", brand: "Hyundai", rangeKm: 614, batteryKwh: 77.4 },
  { id: "kia-ev6", name: "EV6 GT-Line AWD", brand: "Kia", rangeKm: 528, batteryKwh: 77.4 },
  { id: "bmw-i4", name: "i4 eDrive40", brand: "BMW", rangeKm: 590, batteryKwh: 83.9 },
  { id: "vw-id4", name: "ID.4 Pro", brand: "Volkswagen", rangeKm: 520, batteryKwh: 82 },
  { id: "tata-nexon", name: "Nexon EV Max", brand: "Tata", rangeKm: 437, batteryKwh: 40.5 },
  { id: "mg-zs", name: "ZS EV Long Range", brand: "MG", rangeKm: 461, batteryKwh: 72.6 },
  { id: "byd-atto3", name: "Atto 3 Extended", brand: "BYD", rangeKm: 420, batteryKwh: 60.5 },
  { id: "nissan-leaf", name: "Leaf e+", brand: "Nissan", rangeKm: 385, batteryKwh: 62 },
  { id: "chevy-bolt", name: "Bolt EV", brand: "Chevrolet", rangeKm: 417, batteryKwh: 65 },
  { id: "ford-mache", name: "Mustang Mach-E ER", brand: "Ford", rangeKm: 490, batteryKwh: 91 },
  { id: "lucid-air", name: "Air Grand Touring", brand: "Lucid", rangeKm: 832, batteryKwh: 112 },
  { id: "polestar-2", name: "Polestar 2 Long Range", brand: "Polestar", rangeKm: 551, batteryKwh: 82 },
];

const CONNECTORS_GUIDE = [
  { id: "CCS", name: "CCS", fullName: "Combined Charging System", speed: "Up to 350 kW DC", regions: "Europe · North America", color: "#3DBAFF", icon: "▣", description: "The dominant global DC fast-charge standard, supported by virtually every major OEM. CCS Combo 2 (Europe) and Combo 1 (US) share an upper AC port. Your default choice on motorways and retail forecourts." },
  { id: "CHAdeMO", name: "CHAdeMO", fullName: "CHArge de MOve", speed: "Up to 62.5 kW", regions: "Japan · South Korea", color: "#FF8A3D", icon: "◈", description: "Japan's original DC fast-charge protocol, favoured by Nissan and legacy Japanese manufacturers. Common across Japan but declining globally as CCS expands. CHAdeMO 3.0 targets 900V bidirectional V2G charging." },
  { id: "Type 2", name: "Type 2", fullName: "IEC 62196 — Mennekes", speed: "Up to 43 kW AC", regions: "Europe (mandatory)", color: "#A855F7", icon: "⬡", description: "The European AC standard, legally required on all EVs sold in the EU. Used for home wallboxes and public AC destinations. Most European DC chargers pair CCS for DC with Type 2 for AC on the same unit." },
  { id: "NACS", name: "NACS", fullName: "North American Charging Standard", speed: "Up to 350 kW DC", regions: "North America · expanding", color: "#C2FF3D", icon: "✦", description: "Originally Tesla-proprietary, open-sourced 2022, now adopted by Ford, GM, Rivian, Mercedes, Honda, and Nissan. One slim connector handles both AC and DC. Rapidly becoming the de-facto US standard." },
];

// ── India Live Fuel Prices ────────────────────────────────────────────────────

interface CityPrices {
  petrol: number; diesel: number; cng?: number;
  e20: number; e85?: number; e100?: number;
  evHome: number; evACPublic: number; evDCFast: number;
  updated: string;
}

const CITY_FUEL_PRICES: Record<string, CityPrices> = {
  Delhi:      { petrol: 94.72,  diesel: 87.62, cng: 76.59, e20: 89.94, e85: 70.50, e100: 65.00, evHome: 6.00, evACPublic: 8.50,  evDCFast: 17.00, updated: "Jun 2025" },
  Mumbai:     { petrol: 103.44, diesel: 89.97, cng: 88.50, e20: 98.27, e85: 75.20,              evHome: 7.00, evACPublic: 9.00,  evDCFast: 18.00, updated: "Jun 2025" },
  Bangalore:  { petrol: 102.86, diesel: 88.94, cng: 80.00, e20: 97.72, e85: 73.50,              evHome: 6.50, evACPublic: 8.00,  evDCFast: 16.00, updated: "Jun 2025" },
  Chennai:    { petrol: 100.73, diesel: 86.31, cng: 75.00, e20: 95.69, e85: 71.00,              evHome: 6.00, evACPublic: 8.50,  evDCFast: 17.00, updated: "Jun 2025" },
  Pune:       { petrol: 104.18, diesel: 90.73, cng: 85.00, e20: 98.97, e85: 74.50, e100: 67.00, evHome: 7.00, evACPublic: 9.00,  evDCFast: 18.00, updated: "Jun 2025" },
  Hyderabad:  { petrol: 107.36, diesel: 95.65, cng: 90.00, e20: 102.00, e85: 77.00,             evHome: 6.50, evACPublic: 9.00,  evDCFast: 18.00, updated: "Jun 2025" },
  Kolkata:    { petrol: 103.94, diesel: 90.76, cng: 82.00, e20: 98.74, e85: 74.00,              evHome: 6.00, evACPublic: 8.50,  evDCFast: 17.00, updated: "Jun 2025" },
  Ahmedabad:  { petrol: 96.63,  diesel: 92.38, cng: 79.00, e20: 91.80, e85: 69.00,              evHome: 5.50, evACPublic: 8.00,  evDCFast: 16.00, updated: "Jun 2025" },
  Lucknow:    { petrol: 94.56,  diesel: 87.74, cng: 77.00, e20: 89.83, e85: 70.00, e100: 65.00, evHome: 6.00, evACPublic: 8.50,  evDCFast: 17.00, updated: "Jun 2025" },
  Jaipur:     { petrol: 104.72, diesel: 90.22, cng: 76.00, e20: 99.48, e85: 74.50,              evHome: 6.00, evACPublic: 8.50,  evDCFast: 17.00, updated: "Jun 2025" },
  Chandigarh: { petrol: 94.24,  diesel: 82.40, cng: 74.00, e20: 89.53, e85: 69.50,              evHome: 5.50, evACPublic: 8.00,  evDCFast: 16.00, updated: "Jun 2025" },
  Nagpur:     { petrol: 104.18, diesel: 90.73, cng: 85.00, e20: 98.97, e85: 74.50,              evHome: 7.00, evACPublic: 9.00,  evDCFast: 18.00, updated: "Jun 2025" },
  Indore:     { petrol: 108.65, diesel: 93.89, cng: 88.00, e20: 103.22, e85: 77.50,             evHome: 7.00, evACPublic: 9.00,  evDCFast: 18.00, updated: "Jun 2025" },
  Bhopal:     { petrol: 108.65, diesel: 93.89, cng: 88.00, e20: 103.22, e85: 77.50,             evHome: 7.00, evACPublic: 9.00,  evDCFast: 18.00, updated: "Jun 2025" },
};

// ── Countries ─────────────────────────────────────────────────────────────────

interface Country {
  code: string; name: string; flag: string;
  currency: string; symbol: string;
  hasEthanol: boolean;
  defaultCenter: [number, number]; defaultZoom: number;
  fuelPrices: CityPrices;
}

const COUNTRIES: Country[] = [
  { code: "IN", name: "India",         flag: "🇮🇳", currency: "INR", symbol: "₹",   hasEthanol: true,  defaultCenter: [22.0, 79.0],     defaultZoom: 5,  fuelPrices: { petrol: 94.72,  diesel: 87.62, cng: 76.59, e20: 89.94, e85: 70.50, e100: 65.00, evHome: 6.00,  evACPublic: 8.50,  evDCFast: 17.00, updated: "Jun 2025" } },
  { code: "US", name: "United States", flag: "🇺🇸", currency: "USD", symbol: "$",   hasEthanol: false, defaultCenter: [38.0, -97.0],    defaultZoom: 4,  fuelPrices: { petrol: 0.95,   diesel: 0.89,               e20: 0.90,                            evHome: 0.13,  evACPublic: 0.33,  evDCFast: 0.44,  updated: "Jun 2025" } },
  { code: "GB", name: "United Kingdom",flag: "🇬🇧", currency: "GBP", symbol: "£",   hasEthanol: false, defaultCenter: [54.0, -2.0],     defaultZoom: 5,  fuelPrices: { petrol: 1.42,   diesel: 1.49,                                                           evHome: 0.25,  evACPublic: 0.50,  evDCFast: 0.79,  updated: "Jun 2025" } },
  { code: "DE", name: "Germany",       flag: "🇩🇪", currency: "EUR", symbol: "€",   hasEthanol: false, defaultCenter: [51.2, 10.4],     defaultZoom: 6,  fuelPrices: { petrol: 1.74,   diesel: 1.68,                                                           evHome: 0.31,  evACPublic: 0.49,  evDCFast: 0.79,  updated: "Jun 2025" } },
  { code: "FR", name: "France",        flag: "🇫🇷", currency: "EUR", symbol: "€",   hasEthanol: false, defaultCenter: [46.2, 2.2],      defaultZoom: 6,  fuelPrices: { petrol: 1.79,   diesel: 1.75,                                                           evHome: 0.23,  evACPublic: 0.45,  evDCFast: 0.75,  updated: "Jun 2025" } },
  { code: "JP", name: "Japan",         flag: "🇯🇵", currency: "JPY", symbol: "¥",   hasEthanol: false, defaultCenter: [36.2, 138.2],    defaultZoom: 5,  fuelPrices: { petrol: 175,    diesel: 152,                                                            evHome: 25,    evACPublic: 40,    evDCFast: 65,    updated: "Jun 2025" } },
  { code: "AU", name: "Australia",     flag: "🇦🇺", currency: "AUD", symbol: "A$",  hasEthanol: false, defaultCenter: [-25.3, 133.8],   defaultZoom: 4,  fuelPrices: { petrol: 1.85,   diesel: 1.92,                                                           evHome: 0.28,  evACPublic: 0.52,  evDCFast: 0.65,  updated: "Jun 2025" } },
  { code: "CN", name: "China",         flag: "🇨🇳", currency: "CNY", symbol: "¥",   hasEthanol: false, defaultCenter: [35.9, 104.2],    defaultZoom: 4,  fuelPrices: { petrol: 7.50,   diesel: 7.00,                                                           evHome: 0.60,  evACPublic: 1.20,  evDCFast: 1.80,  updated: "Jun 2025" } },
  { code: "BR", name: "Brazil",        flag: "🇧🇷", currency: "BRL", symbol: "R$",  hasEthanol: true,  defaultCenter: [-14.2, -51.9],   defaultZoom: 4,  fuelPrices: { petrol: 6.00,   diesel: 5.70,               e20: 5.40, e85: 4.20, e100: 3.80,           evHome: 0.80,  evACPublic: 1.50,  evDCFast: 2.50,  updated: "Jun 2025" } },
  { code: "CA", name: "Canada",        flag: "🇨🇦", currency: "CAD", symbol: "C$",  hasEthanol: false, defaultCenter: [56.1, -106.3],   defaultZoom: 4,  fuelPrices: { petrol: 1.65,   diesel: 1.55,                                                           evHome: 0.14,  evACPublic: 0.32,  evDCFast: 0.48,  updated: "Jun 2025" } },
  { code: "NO", name: "Norway",        flag: "🇳🇴", currency: "NOK", symbol: "kr",  hasEthanol: false, defaultCenter: [60.5, 8.5],      defaultZoom: 5,  fuelPrices: { petrol: 19.50,  diesel: 18.80,                                                          evHome: 1.20,  evACPublic: 3.50,  evDCFast: 5.50,  updated: "Jun 2025" } },
  { code: "NL", name: "Netherlands",   flag: "🇳🇱", currency: "EUR", symbol: "€",   hasEthanol: false, defaultCenter: [52.1, 5.3],      defaultZoom: 7,  fuelPrices: { petrol: 2.04,   diesel: 1.79,                                                           evHome: 0.35,  evACPublic: 0.55,  evDCFast: 0.89,  updated: "Jun 2025" } },
  { code: "SG", name: "Singapore",     flag: "🇸🇬", currency: "SGD", symbol: "S$",  hasEthanol: false, defaultCenter: [1.35,  103.82],  defaultZoom: 11, fuelPrices: { petrol: 2.94,   diesel: 2.12,                                                           evHome: 0.30,  evACPublic: 0.55,  evDCFast: 0.80,  updated: "Jun 2025" } },
  { code: "AE", name: "UAE",           flag: "🇦🇪", currency: "AED", symbol: "د.إ", hasEthanol: false, defaultCenter: [24.0, 54.0],     defaultZoom: 7,  fuelPrices: { petrol: 0.79,   diesel: 0.73,                                                           evHome: 0.08,  evACPublic: 0.25,  evDCFast: 0.45,  updated: "Jun 2025" } },
  { code: "ZA", name: "South Africa",  flag: "🇿🇦", currency: "ZAR", symbol: "R",   hasEthanol: false, defaultCenter: [-28.5, 25.0],    defaultZoom: 5,  fuelPrices: { petrol: 24.18,  diesel: 22.73,                                                          evHome: 2.72,  evACPublic: 5.00,  evDCFast: 8.50,  updated: "Jun 2025" } },
  { code: "KR", name: "South Korea",   flag: "🇰🇷", currency: "KRW", symbol: "₩",   hasEthanol: false, defaultCenter: [36.5, 127.5],    defaultZoom: 7,  fuelPrices: { petrol: 1680,   diesel: 1480,                                                           evHome: 100,   evACPublic: 250,   evDCFast: 420,   updated: "Jun 2025" } },
];

// ── Cheapest option ────────────────────────────────────────────────────────────

interface CheapestOption { label: string; tag: string; icon: string; display: string; costPerKm: number; color: string; pct: number; }

function computeCheapestPerKm(prices: CityPrices, sym: string): CheapestOption[] {
  const pm = 15;    // avg petrol car km/L
  const em = 6.5;  // avg EV km/kWh
  const petrolPerKm = prices.petrol / pm;
  const opts: Omit<CheapestOption, "pct">[] = [
    { label: "EV Home",       tag: "evHome",  icon: "🏠", display: `${sym}${prices.evHome}/kWh`,      costPerKm: prices.evHome    / em,          color: "#C2FF3D" },
    { label: "EV Public AC",  tag: "evAC",    icon: "⚡", display: `${sym}${prices.evACPublic}/kWh`,   costPerKm: prices.evACPublic / em,         color: "#C2FF3D" },
    { label: "EV DC Fast",    tag: "evDC",    icon: "⚡", display: `${sym}${prices.evDCFast}/kWh`,     costPerKm: prices.evDCFast  / em,          color: "#3DBAFF" },
    { label: "Diesel",        tag: "diesel",  icon: "🛢️", display: `${sym}${prices.diesel}/L`,         costPerKm: prices.diesel    / (pm * 1.25), color: "#7A828E" },
  ];
  if (prices.cng)  opts.push({ label: "CNG",          tag: "cng",  icon: "💨", display: `${sym}${prices.cng}/kg`,   costPerKm: prices.cng!  / 25,          color: "#22D3EE" });
  if (prices.e100) opts.push({ label: "E100 Ethanol",  tag: "e100", icon: "🌿", display: `${sym}${prices.e100}/L`,  costPerKm: prices.e100! / (pm * 0.72), color: "#15803D" });
  if (prices.e85)  opts.push({ label: "E85 Flex-Fuel", tag: "e85",  icon: "🌿", display: `${sym}${prices.e85}/L`,   costPerKm: prices.e85!  / (pm * 0.90), color: "#16A34A" });
  if (prices.e20)  opts.push({ label: "E20 Blend",     tag: "e20",  icon: "🌿", display: `${sym}${prices.e20}/L`,   costPerKm: prices.e20   / (pm * 0.95), color: "#4ADE80" });
  opts.push({ label: "Petrol", tag: "petrol", icon: "⛽", display: `${sym}${prices.petrol}/L`, costPerKm: petrolPerKm, color: "#FF8A3D" });
  opts.sort((a, b) => a.costPerKm - b.costPerKm);
  return opts.map(o => ({ ...o, pct: Math.round((1 - o.costPerKm / petrolPerKm) * 100) }));
}

// ── Price Ticker ──────────────────────────────────────────────────────────────

function PriceTicker({ city, prices, symbol }: { city: string; prices: CityPrices; symbol: string }) {
  const s = symbol;
  const items: { label: string; val: string; col: string }[] = [
    { label: "Petrol",     val: `${s}${prices.petrol}/L`,        col: "#FF8A3D" },
    { label: "Diesel",     val: `${s}${prices.diesel}/L`,        col: "#7A828E" },
    ...(prices.cng  ? [{ label: "CNG",      val: `${s}${prices.cng}/kg`,      col: "#22D3EE" }] : []),
    ...(prices.e20  ? [{ label: "E20",      val: `${s}${prices.e20}/L`,       col: "#4ADE80" }] : []),
    ...(prices.e85  ? [{ label: "E85",      val: `${s}${prices.e85}/L`,       col: "#16A34A" }] : []),
    ...(prices.e100 ? [{ label: "E100",     val: `${s}${prices.e100}/L`,      col: "#15803D" }] : []),
    { label: "EV Home",    val: `${s}${prices.evHome}/kWh`,      col: "#C2FF3D" },
    { label: "EV AC",      val: `${s}${prices.evACPublic}/kWh`,  col: "#C2FF3D" },
    { label: "EV DC Fast", val: `${s}${prices.evDCFast}/kWh`,    col: "#3DBAFF" },
  ];
  const row = items.map((it, i) => (
    <span key={i} className="inline-flex items-center gap-2 mr-10 flex-shrink-0">
      <span className="text-[9px] font-mono text-muted-foreground tracking-wider">{it.label}</span>
      <span className="text-[11px] font-mono font-bold" style={{ color: it.col }}>{it.val}</span>
    </span>
  ));
  return (
    <div className="flex items-center gap-3 px-4 border-b border-border overflow-hidden flex-shrink-0" style={{ height: 36, background: "#0F1217" }}>
      <div className="flex items-center gap-1.5 flex-shrink-0 pr-3 border-r border-border">
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#4ADE80" }} />
        <span className="text-[9px] font-mono font-bold tracking-widest uppercase" style={{ color: "#4ADE80" }}>LIVE</span>
        <span className="text-[9px] font-mono text-muted-foreground ml-2">{city}</span>
      </div>
      <div className="flex-1 overflow-hidden" style={{ maskImage: "linear-gradient(to right, transparent, black 5%, black 95%, transparent)" }}>
        <div className="flex" style={{ animation: "ticker-scroll 28s linear infinite", willChange: "transform" }}>
          {row}{row}
        </div>
      </div>
      <span className="text-[9px] font-mono text-muted-foreground flex-shrink-0 hidden sm:block">{prices.updated}</span>
    </div>
  );
}

// ── Cheapest Per Km Panel ─────────────────────────────────────────────────────

function CheapestPerKmPanel({ city, prices, symbol }: { city: string; prices: CityPrices; symbol: string }) {
  const ranked = computeCheapestPerKm(prices, symbol);
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="px-4 py-3 border-b border-border flex-shrink-0" style={{ background: "#0F1217" }}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[9px] font-mono font-bold tracking-widest uppercase" style={{ color: "#C2FF3D" }}>💰 Cheapest per km — {city}</span>
        <span className="text-[9px] font-mono text-muted-foreground">15 km/L avg car</span>
      </div>
      <div className="space-y-1.5">
        {ranked.slice(0, 6).map((opt, i) => {
          const isEV = opt.tag.startsWith("ev");
          const bar = Math.round((1 - opt.costPerKm / (ranked[ranked.length - 1].costPerKm)) * 100);
          return (
            <div key={opt.tag} className="flex items-center gap-2">
              <span className="text-[10px] w-5 flex-shrink-0 text-center">{medals[i] || `${i + 1}.`}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-[10px] font-mono text-foreground truncate">{opt.icon} {opt.label}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-mono font-bold" style={{ color: opt.color }}>{symbol}{opt.costPerKm.toFixed(2)}/km</span>
                    {opt.pct > 0 && <span className="text-[9px] font-mono font-bold" style={{ color: isEV ? "#C2FF3D" : "#4ADE80" }}>↓{opt.pct}%</span>}
                  </div>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(bar, 8)}%`, background: opt.color, opacity: 0.7 }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[9px] font-mono text-muted-foreground/50">EV: 6.5 km/kWh avg · CNG: 25 km/kg · Diesel: 18.75 km/L</div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isInIndia(lat: number, lng: number) { return lat >= 8 && lat <= 37 && lng >= 68 && lng <= 97.5; }

function nearestEthCity(lat: number, lng: number): string {
  return Object.entries(ETHANOL_CITY_CENTERS).reduce((best, [city, [clat, clng]]) => {
    return haversineKm(lat, lng, clat, clng) < haversineKm(lat, lng, ...ETHANOL_CITY_CENTERS[best]) ? city : best;
  }, "Delhi");
}

function normalizeConnector(title?: string): string {
  if (!title) return "AC";
  const t = title.toLowerCase();
  if (t.includes("ccs") || t.includes("combo")) return "CCS";
  if (t.includes("chademo")) return "CHAdeMO";
  if (t.includes("type 2") || t.includes("mennekes")) return "Type 2";
  if (t.includes("j1772") || t.includes("type 1")) return "J1772";
  if (t.includes("tesla") || t.includes("nacs")) return "NACS";
  return title.split("(")[0].trim().substring(0, 10);
}

function getConnectors(s: OCMStation): string[] {
  const seen = new Set<string>(); const result: string[] = [];
  (s.Connections || []).forEach((c) => { const n = normalizeConnector(c.ConnectionType?.Title); if (!seen.has(n)) { seen.add(n); result.push(n); } });
  return result.length > 0 ? result : ["AC"];
}

function getMaxPower(s: OCMStation) { return Math.max(0, ...(s.Connections || []).map((c) => c.PowerKW || 0)); }
function isOperational(s: OCMStation) { return s.StatusType == null || s.StatusType.IsOperational !== false; }
function fmtDist(d?: number) { return !d ? "" : d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)} km`; }
function mapsUrl(lat: number, lng: number) { return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`; }

function getHighestBlend(blends: string[]): string {
  const order = ["E100", "E85", "E50", "E20", "E10"];
  return order.find((b) => blends.includes(b)) || blends[0];
}

// ── API ────────────────────────────────────────────────────────────────────────

async function fetchOCMStations(lat: number, lng: number, distKm: number, countryCode?: string): Promise<OCMStation[]> {
  const cc = countryCode ? `&countrycode=${countryCode}` : "";
  const url = `https://api.openchargemap.io/v3/poi/?output=json&latitude=${lat}&longitude=${lng}&distance=${distKm}&maxresults=100&distanceunit=KM&verbose=false${cc}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("API error");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function geocodeSearch(query: string): Promise<GeoResult[]> {
  if (query.length < 2) return [];
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6`, { headers: { "Accept-Language": "en", "User-Agent": "ChargeIQ/1.0" } });
  return res.json();
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { headers: { "Accept-Language": "en", "User-Agent": "ChargeIQ/1.0" } });
    const d = await res.json();
    return d.address?.city || d.address?.town || d.address?.village || d.display_name?.split(",")[0] || "Your Location";
  } catch { return "Your Location"; }
}

// ── Leaflet icons ──────────────────────────────────────────────────────────────

const BOLT_HTML = `<svg viewBox="0 0 24 24" style="width:10px;height:10px;fill:#000;display:block"><path d="M13 2L4.09 12.96H11L11 22L19.91 11.04H13L13 2Z"/></svg>`;
const BLEND_COLORS: Record<string, string> = { E20: "#4ADE80", E50: "#22C55E", E85: "#16A34A", E100: "#15803D", E10: "#86EFAC" };

function makeEVMarkerEl(color: string, operational: boolean): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `width:24px;height:24px;border-radius:50%;background:${operational ? color : "#52575E"};border:2.5px solid rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px ${color}33,0 2px 6px rgba(0,0,0,0.4);cursor:pointer;`;
  el.innerHTML = BOLT_HTML;
  return el;
}

function makeEthanolMarkerEl(primaryBlend: string): HTMLElement {
  const col = BLEND_COLORS[primaryBlend] || "#22C55E";
  const label = primaryBlend.replace("E", "");
  const el = document.createElement("div");
  el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${col};border:2.5px solid rgba(255,255,255,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 0 0 3px ${col}44,0 2px 8px rgba(0,0,0,0.45);cursor:pointer;gap:0;`;
  el.innerHTML = `<span style="font-size:7px;font-weight:900;color:#064e3b;font-family:monospace;line-height:1;letter-spacing:-0.5px">E</span><span style="font-size:6px;font-weight:900;color:#064e3b;font-family:monospace;line-height:1">${label}</span>`;
  return el;
}

function makeUserMarkerEl(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "position:relative;width:20px;height:20px;";
  el.innerHTML = `<div style="position:absolute;inset:-5px;border-radius:50%;background:rgba(66,133,244,0.25);animation:ev-pulse 2s cubic-bezier(0,0,0.2,1) infinite;"></div><div style="width:20px;height:20px;border-radius:50%;background:#4285F4;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`;
  return el;
}

// ── Popup HTML builders (used with raw Leaflet, no react-leaflet) ─────────────

function evPopupHTML(s: OCMStation): string {
  const conns = getConnectors(s); const power = getMaxPower(s); const op = isOperational(s);
  const addr = [s.AddressInfo.AddressLine1, s.AddressInfo.Town].filter(Boolean).join(", ");
  const badges = conns.map(c => { const col = CONNECTOR_COLORS[c] || "#7A828E"; return `<span style="font-size:9px;font-family:monospace;font-weight:600;padding:2px 6px;border-radius:3px;color:${col};background:${col}18;border:1px solid ${col}35;letter-spacing:.08em">${c}</span>`; }).join("");
  return `<div style="font-family:'DM Sans',sans-serif;padding:14px 16px;min-width:210px;max-width:250px"><div style="font-weight:600;font-size:13px;color:#F3F1EA;margin-bottom:4px;line-height:1.3">${s.AddressInfo.Title}</div>${addr ? `<div style="font-size:11px;color:#7A828E;margin-bottom:8px">${addr}</div>` : ""}<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;align-items:center">${badges}${power > 0 ? `<span style="font-size:10px;font-family:monospace;color:#C2FF3D;margin-left:auto">${power} kW</span>` : ""}</div><div style="display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:5px"><div style="width:6px;height:6px;border-radius:50%;background:${op ? "#C2FF3D" : "#FF4D4D"}"></div><span style="font-size:10px;font-family:monospace;color:${op ? "#C2FF3D" : "#FF4D4D"}">${op ? "Operational" : "Unavailable"}</span></div><a href="${mapsUrl(s.AddressInfo.Latitude, s.AddressInfo.Longitude)}" target="_blank" style="font-size:11px;color:#C2FF3D;text-decoration:none">Directions ↗</a></div></div>`;
}

function ethPopupHTML(s: EthanolStation): string {
  const high = getHighestBlend(s.blends); const col = BLEND_COLORS[high] || "#22C55E";
  const badges = s.blends.map(b => { const bc = BLEND_COLORS[b] || "#22C55E"; return `<span style="font-size:9px;font-family:monospace;font-weight:700;padding:2px 6px;border-radius:3px;color:${bc};background:${bc}18;border:1px solid ${bc}35">${b}</span>`; }).join("");
  return `<div style="font-family:'DM Sans',sans-serif;padding:14px 16px;min-width:210px;max-width:250px"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><div style="width:10px;height:10px;border-radius:50%;background:${col};flex-shrink:0;box-shadow:0 0 6px ${col}"></div><span style="font-weight:600;font-size:13px;color:#F3F1EA;line-height:1.3">${s.name}</span></div><div style="font-size:11px;color:#7A828E;margin-bottom:8px">${s.address}</div><div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;align-items:center">${badges}<span style="font-size:9px;font-family:monospace;color:#7A828E;margin-left:auto">${s.operator}</span></div><div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:10px;font-family:monospace;color:${s.open24h ? "#4ADE80" : "#7A828E"}">${s.open24h ? "24h Open" : "Check timing"}</span><a href="${mapsUrl(s.lat, s.lng)}" target="_blank" style="font-size:11px;color:#4ADE80;text-decoration:none">Directions ↗</a></div></div>`;
}

// ── Shared UI ──────────────────────────────────────────────────────────────────

function ConnectorBadge({ type }: { type: string }) {
  const color = CONNECTOR_COLORS[type] || "#7A828E";
  return <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded-sm tracking-wide" style={{ color, background: color + "18", border: `1px solid ${color}35` }}>{type}</span>;
}

function BlendBadge({ blend }: { blend: string }) {
  const col = BLEND_COLORS[blend] || "#22C55E";
  return <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded-sm tracking-wide" style={{ color: col, background: col + "18", border: `1px solid ${col}35` }}>{blend}</span>;
}

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return <motion.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

function SectionLabel({ eyebrow }: { eyebrow: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-px bg-primary opacity-70" />
      <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-primary opacity-80">{eyebrow}</span>
    </div>
  );
}

// ── Popups ─────────────────────────────────────────────────────────────────────


// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════

export default function App() {
  // Mode
  const [fuelMode, setFuelMode] = useState<FuelMode>("ev");
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]); // India default
  const [countryDropOpen, setCountryDropOpen] = useState(false);
  const countryRef = useRef<HTMLDivElement>(null);

  // Core state
  const [step, setStep] = useState<AppStep>("initial");
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [mapAction, setMapAction] = useState<MapAction>(null);
  const [locationLabel, setLocationLabel] = useState("Near You");

  // EV station state
  const [evStations, setEvStations] = useState<OCMStation[]>([]);
  const [evFetching, setEvFetching] = useState(false);
  const [distKm, setDistKm] = useState(10);
  const [connFilter, setConnFilter] = useState("All");
  const [activeEVStation, setActiveEVStation] = useState<number | null>(null);

  // Ethanol state
  const [ethanolCity, setEthanolCity] = useState("Delhi");
  const [blendFilter, setBlendFilter] = useState("All");
  const [activeEthStation, setActiveEthStation] = useState<string | null>(null);

  // Search
  const [cityQuery, setCityQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [searchFocus, setSearchFocus] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // MapLibre GL refs
  const mapDivRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<maplibregl.Map | null>(null);
  const stationMarkersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Range calc
  const [model, setModel] = useState(EV_MODELS[0]);
  const [battPct, setBattPct] = useState(80);
  const [driveMode, setDriveMode] = useState<"City" | "Highway" | "Mixed">("Mixed");
  const [acOn, setAcOn] = useState(false);

  // Cost calc
  const [elecPrice, setElecPrice] = useState(0.25);
  const [petrolPrice, setPetrolPrice] = useState(1.8);
  const [petrolEffic, setPetrolEffic] = useState(12);
  const [dailyKm, setDailyKm] = useState(50);

  // Flex-fuel calc
  const [baseMileage, setBaseMileage] = useState(18);
  const [dailyDriveKm, setDailyDriveKm] = useState(40);
  const [petrolPriceINR, setPetrolPriceINR] = useState(105);
  const [ethanolPriceINR, setEthanolPriceINR] = useState(65);
  const [selectedBlend, setSelectedBlend] = useState("E20");

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchFocus(false);
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) setCountryDropOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Derived — plain const so no hook ordering issues
  const filteredEV = evStations
    .filter((st) => connFilter === "All" || getConnectors(st).includes(connFilter))
    .sort((a, b) => (a.AddressInfo.Distance || 999) - (b.AddressInfo.Distance || 999));

  const filteredEth = (() => {
    const all = ETHANOL_PUMPS[ethanolCity] || [];
    const base = blendFilter === "All" ? all : all.filter((p) => p.blends.includes(blendFilter));
    if (userLoc && isInIndia(userLoc.lat, userLoc.lng)) {
      return [...base].sort((a, b) => haversineKm(userLoc.lat, userLoc.lng, a.lat, a.lng) - haversineKm(userLoc.lat, userLoc.lng, b.lat, b.lng));
    }
    return base;
  })();

  // Initialise MapLibre GL map once
  useEffect(() => {
    if (!mapDivRef.current || leafletRef.current) return;
    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [78, 20],
      zoom: 4,
      attributionControl: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right"
    );
    leafletRef.current = map;
    return () => { map.remove(); leafletRef.current = null; };
  }, []);

  // Fly to location when mapAction changes
  useEffect(() => {
    if (mapAction && leafletRef.current) {
      leafletRef.current.flyTo({ center: [mapAction.lng, mapAction.lat], zoom: mapAction.zoom ?? 14, duration: 1000, essential: true });
    }
  }, [mapAction]);

  // User location marker
  useEffect(() => {
    if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
    if (!userLoc || !leafletRef.current) return;
    const popup = new maplibregl.Popup({ offset: 12, maxWidth: "220px" })
      .setHTML(`<div style="font-family:'DM Sans',sans-serif;padding:10px 14px"><div style="font-weight:600;font-size:12px;color:#F3F1EA">📍 Your Location</div><div style="font-size:10px;color:#7A828E;margin-top:2px">${locationLabel}</div></div>`);
    userMarkerRef.current = new maplibregl.Marker({ element: makeUserMarkerEl() })
      .setLngLat([userLoc.lng, userLoc.lat])
      .setPopup(popup)
      .addTo(leafletRef.current);
  }, [userLoc, locationLabel]);

  // Station markers — re-render whenever stations or mode changes
  useEffect(() => {
    stationMarkersRef.current.forEach((m) => m.remove());
    stationMarkersRef.current = [];
    if (!leafletRef.current) return;
    const map = leafletRef.current;
    if (fuelMode === "ev") {
      filteredEV.forEach((s) => {
        const col = CONNECTOR_COLORS[getConnectors(s)[0]] || "#C2FF3D";
        const el = makeEVMarkerEl(col, isOperational(s));
        const popup = new maplibregl.Popup({ offset: 14, maxWidth: "280px" }).setHTML(evPopupHTML(s));
        el.addEventListener("click", () => setActiveEVStation(s.ID));
        const m = new maplibregl.Marker({ element: el })
          .setLngLat([s.AddressInfo.Longitude, s.AddressInfo.Latitude])
          .setPopup(popup)
          .addTo(map);
        stationMarkersRef.current.push(m);
      });
    } else {
      filteredEth.forEach((s) => {
        const high = getHighestBlend(s.blends);
        const el = makeEthanolMarkerEl(high);
        const popup = new maplibregl.Popup({ offset: 16, maxWidth: "280px" }).setHTML(ethPopupHTML(s));
        el.addEventListener("click", () => setActiveEthStation(s.id));
        const m = new maplibregl.Marker({ element: el })
          .setLngLat([s.lng, s.lat])
          .setPopup(popup)
          .addTo(map);
        stationMarkersRef.current.push(m);
      });
    }
  }, [fuelMode, evStations, connFilter, ethanolCity, blendFilter, userLoc]);

  const handleCountryChange = useCallback((country: Country) => {
    setSelectedCountry(country);
    setCountryDropOpen(false);
    setMapAction({ lat: country.defaultCenter[0], lng: country.defaultCenter[1], zoom: country.defaultZoom });
    setEvStations([]);
    setStep("initial");
    setConnFilter("All");
    setCityQuery("");
    if (!country.hasEthanol && fuelMode === "ethanol") setFuelMode("ev");
  }, [fuelMode]);

  const loadEVStations = useCallback(async (lat: number, lng: number, dist: number, cc?: string) => {
    setEvFetching(true);
    try { setEvStations(await fetchOCMStations(lat, lng, dist, cc)); }
    catch { setEvStations([]); }
    finally { setEvFetching(false); }
  }, []);

  const requestGPS = useCallback(() => {
    setStep("requesting");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserLoc({ lat, lng });
        setMapAction({ lat, lng, zoom: 16 });
        setStep("loaded");
        if (fuelMode === "ev") {
          loadEVStations(lat, lng, distKm, selectedCountry.code);
        } else {
          if (isInIndia(lat, lng)) {
            const city = nearestEthCity(lat, lng);
            setEthanolCity(city);
            setMapAction({ lat: ETHANOL_CITY_CENTERS[city][0], lng: ETHANOL_CITY_CENTERS[city][1], zoom: 13 });
          }
        }
        reverseGeocode(lat, lng).then(setLocationLabel);
      },
      () => setStep("denied"),
      { timeout: 12000, enableHighAccuracy: true }
    );
  }, [fuelMode, distKm, loadEVStations]);

  const pickGeoResult = useCallback(async (r: GeoResult) => {
    const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
    setMapAction({ lat, lng, zoom: 16 });
    setStep("loaded");
    const label = r.display_name.split(",")[0];
    setLocationLabel(label);
    setCityQuery(label);
    setGeoResults([]); setSearchFocus(false);
    if (fuelMode === "ev") {
      loadEVStations(lat, lng, distKm);
    } else {
      if (isInIndia(lat, lng)) {
        const city = nearestEthCity(lat, lng);
        setEthanolCity(city);
        setMapAction({ lat: ETHANOL_CITY_CENTERS[city][0], lng: ETHANOL_CITY_CENTERS[city][1], zoom: 13 });
      }
    }
  }, [fuelMode, distKm, loadEVStations]);

  const handleCityInput = (val: string) => {
    setCityQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.length < 2) { setGeoResults([]); return; }
    searchTimer.current = setTimeout(async () => setGeoResults(await geocodeSearch(val)), 350);
  };

  const selectEthCity = (city: string) => {
    setEthanolCity(city);
    setBlendFilter("All");
    setActiveEthStation(null);
    const [lat, lng] = ETHANOL_CITY_CENTERS[city];
    setMapAction({ lat, lng, zoom: 13 });
    if (step !== "loaded") setStep("loaded");
  };

  const changeDistance = (km: number) => {
    setDistKm(km);
    if (userLoc && step === "loaded" && fuelMode === "ev") loadEVStations(userLoc.lat, userLoc.lng, km, selectedCountry.code);
  };

  const switchMode = (mode: FuelMode) => {
    setFuelMode(mode);
    setActiveEVStation(null); setActiveEthStation(null);
    if (mode === "ethanol") {
      const [lat, lng] = ETHANOL_CITY_CENTERS[ethanolCity];
      setMapAction({ lat, lng, zoom: 13 });
      if (step !== "loaded") setStep("loaded");
    } else if (userLoc) {
      setMapAction({ lat: userLoc.lat, lng: userLoc.lng, zoom: 14 });
    }
  };


  // Range calc
  const modeFactor = { City: 1.12, Highway: 0.83, Mixed: 1.0 }[driveMode];
  const estimatedRange = Math.round((battPct / 100) * model.rangeKm * modeFactor * (acOn ? 0.88 : 1));
  const rangeColor = estimatedRange < 80 ? "#FF4D4D" : estimatedRange < 150 ? "#FF8A3D" : "#C2FF3D";

  // Cost calc
  const evCostPerKm = (elecPrice * model.batteryKwh) / model.rangeKm;
  const petrolCostPerKm = petrolPrice / petrolEffic;
  const evMonthly = evCostPerKm * dailyKm * 30;
  const petrolMonthly = petrolCostPerKm * dailyKm * 30;
  const annualSavings = (petrolCostPerKm - evCostPerKm) * dailyKm * 365;
  const maxMonthly = Math.max(evMonthly, petrolMonthly, 1);

  // Flex-fuel calc
  const blend = BLEND_INFO.find((b) => b.id === selectedBlend) || BLEND_INFO[0];
  const blendCostPerL = petrolPriceINR + (ethanolPriceINR - petrolPriceINR) * (1 - blend.blendCostFactor);
  const effectiveMileage = baseMileage * (1 + blend.mileageAdj / 100);
  const petrolCostPerKmINR = petrolPriceINR / baseMileage;
  const blendCostPerKmINR = blendCostPerL / effectiveMileage;
  const monthlySavingsINR = (petrolCostPerKmINR - blendCostPerKmINR) * dailyDriveKm * 30;
  const co2SavedKgMonth = (blend.co2Save / 100) * (dailyDriveKm * 30 / baseMileage) * 2.392;
  const blendFraction = parseInt(selectedBlend.substring(1)) / 100;
  const blendLiterCost = blendFraction * ethanolPriceINR + (1 - blendFraction) * petrolPriceINR;

  const showMap = step === "loaded" || step === "requesting" || fuelMode === "ethanol";

  // Live price — city-level for India, country-level for others
  const priceCity = selectedCountry.code === "IN"
    ? (CITY_FUEL_PRICES[ethanolCity] ? ethanolCity : CITY_FUEL_PRICES[locationLabel] ? locationLabel : "Delhi")
    : selectedCountry.name;
  const currentPrices = selectedCountry.code === "IN"
    ? (CITY_FUEL_PRICES[priceCity] || CITY_FUEL_PRICES["Delhi"])
    : selectedCountry.fuelPrices;
  const currencySymbol = selectedCountry.symbol;

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/92 backdrop-blur-md">
        <div className="h-14 px-4 lg:px-6 flex items-center gap-3">
          <a href="#" className="flex items-center gap-2 flex-shrink-0 mr-1">
            <Zap className="w-4 h-4 text-primary" strokeWidth={2.5} />
            <span className="font-heading text-sm font-bold tracking-[0.14em] uppercase text-primary hidden sm:block">ChargeIQ</span>
          </a>

          {/* Search */}
          <div className="flex-1 relative max-w-lg" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder={fuelMode === "ethanol" ? "Search Indian city for ethanol pumps…" : "Search any city worldwide for EV chargers…"}
              value={cityQuery}
              onChange={(e) => handleCityInput(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              className="w-full pl-9 pr-8 py-2 text-sm rounded-md outline-none transition-all"
              style={{ background: "#1A1E24", border: "1px solid rgba(194,255,61,0.12)", color: "#F3F1EA" }}
            />
            {cityQuery && (
              <button onClick={() => { setCityQuery(""); setGeoResults([]); }} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
            <AnimatePresence>
              {searchFocus && geoResults.length > 0 && (
                <motion.div className="absolute top-full mt-1 left-0 right-0 rounded-md overflow-hidden z-50" style={{ background: "#1A1E24", border: "1px solid rgba(194,255,61,0.15)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                  {geoResults.map((r) => (
                    <button key={r.place_id} className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors flex items-center gap-2.5 border-b border-white/4 last:border-0" onClick={() => pickGeoResult(r)}>
                      <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <span className="text-foreground truncate">{r.display_name}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button onClick={requestGPS} className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono uppercase tracking-widest flex-shrink-0 transition-all duration-200 hover:opacity-90 active:scale-95" style={{ background: step === "requesting" ? "#1A1E24" : "#C2FF3D", color: step === "requesting" ? "#C2FF3D" : "#0A0D10", border: step === "requesting" ? "1px solid #C2FF3D40" : "none" }}>
            {step === "requesting" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">{step === "requesting" ? "Locating…" : "My Location"}</span>
          </button>

          {/* ── Country Selector ── */}
          <div className="relative flex-shrink-0" ref={countryRef}>
            <button
              onClick={() => setCountryDropOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-mono tracking-wider transition-all duration-200 hover:bg-white/5"
              style={{ background: "#1A1E24", border: "1px solid rgba(194,255,61,0.15)", color: "#F3F1EA" }}
              title="Select country"
            >
              <span className="text-base leading-none">{selectedCountry.flag}</span>
              <span className="hidden sm:inline text-[11px]">{selectedCountry.name}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>

            <AnimatePresence>
              {countryDropOpen && (
                <motion.div
                  className="absolute top-full right-0 mt-1 z-50 rounded-lg p-3"
                  style={{ background: "#1A1E24", border: "1px solid rgba(194,255,61,0.15)", boxShadow: "0 12px 40px rgba(0,0,0,0.6)", width: 320 }}
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="text-[9px] font-mono tracking-widest uppercase text-muted-foreground mb-3 px-1">Select your country</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {COUNTRIES.map((country) => {
                      const active = selectedCountry.code === country.code;
                      return (
                        <button
                          key={country.code}
                          onClick={() => handleCountryChange(country)}
                          className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-md text-center transition-all duration-150 hover:bg-white/5"
                          style={{
                            background: active ? "rgba(194,255,61,0.08)" : "transparent",
                            border: `1px solid ${active ? "rgba(194,255,61,0.35)" : "transparent"}`,
                          }}
                        >
                          <span className="text-2xl leading-none">{country.flag}</span>
                          <span className="text-[9px] font-mono text-muted-foreground leading-tight mt-0.5">{country.name.split(" ")[0]}</span>
                          {country.hasEthanol && (
                            <span className="text-[7px] font-mono font-bold" style={{ color: "#4ADE80" }}>+ Ethanol</span>
                          )}
                          <span className="text-[8px] font-mono" style={{ color: active ? "#C2FF3D" : "#7A828E" }}>{country.currency}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="hidden lg:flex items-center gap-4 ml-1">
            {["range", "ethanol", "cost", "connectors"].map((id) => (
              <a key={id} href={`#${id}`} className="text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground hover:text-primary transition-colors">{id}</a>
            ))}
          </div>
        </div>
      </nav>

      {/* ══════════════════ MAP SECTION ══════════════════ */}
      <div id="stations" className="pt-14 flex flex-col" style={{ height: "calc(100vh - 56px)", minHeight: 520 }}>

        {/* ── Live Price Ticker (full width) ── */}
        <PriceTicker city={priceCity} prices={currentPrices} symbol={currencySymbol} />

        {/* ── Left Panel + Map row ── */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">

        {/* ── Left Panel ── */}
        <div className="flex flex-col bg-background border-r border-border w-full h-[46vh] lg:w-[390px] lg:h-auto lg:flex-none overflow-hidden">

          {/* Mode toggle tabs */}
          <div className="flex border-b border-border flex-shrink-0">
            <button
              onClick={() => switchMode("ev")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-mono uppercase tracking-wider transition-all duration-200 ${selectedCountry.hasEthanol ? "border-r border-border" : ""}`}
              style={{ background: fuelMode === "ev" ? "rgba(194,255,61,0.07)" : "transparent", color: fuelMode === "ev" ? "#C2FF3D" : "#7A828E", borderBottom: fuelMode === "ev" ? "2px solid #C2FF3D" : "2px solid transparent" }}
            >
              <Zap className="w-3.5 h-3.5" />
              EV Chargers
              <span className="text-[9px] font-mono opacity-60 hidden sm:inline">{selectedCountry.flag}</span>
            </button>
            {selectedCountry.hasEthanol && (
              <button
                onClick={() => switchMode("ethanol")}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-xs font-mono uppercase tracking-wider transition-all duration-200"
                style={{ background: fuelMode === "ethanol" ? "rgba(74,222,128,0.07)" : "transparent", color: fuelMode === "ethanol" ? "#4ADE80" : "#7A828E", borderBottom: fuelMode === "ethanol" ? "2px solid #4ADE80" : "2px solid transparent" }}
              >
                <Leaf className="w-3.5 h-3.5" />
                Ethanol {selectedCountry.code === "IN" ? "India" : selectedCountry.name}
              </button>
            )}
          </div>

          {/* Panel header */}
          <div className="px-4 py-3 border-b border-border flex-shrink-0">
            {fuelMode === "ev" ? (
              step === "initial" || step === "denied" ? (
                <div>
                  <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-0.5">EV Station Finder</div>
                  <div className="text-sm font-medium text-foreground">{step === "denied" ? "Location denied — search above" : "Share location or search a city"}</div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">EV Stations near</div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-sm font-medium text-foreground">
                      <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      {locationLabel}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {evFetching ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" /> : <button onClick={() => userLoc && loadEVStations(userLoc.lat, userLoc.lng, distKm, selectedCountry.code)} className="p-1.5 rounded hover:bg-white/5"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" /></button>}
                    <span className="text-[11px] font-mono text-primary font-medium">{filteredEV.length}</span>
                  </div>
                </div>
              )
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono tracking-widest uppercase" style={{ color: "#4ADE80" }}>Ethanol Pumps — India</div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-sm font-medium text-foreground">
                    <Leaf className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#4ADE80" }} />
                    {ethanolCity}
                  </div>
                </div>
                <span className="text-[11px] font-mono font-medium" style={{ color: "#4ADE80" }}>{filteredEth.length} pumps</span>
              </div>
            )}
          </div>

          {/* Filters row */}
          <div className="px-3 py-2.5 border-b border-border flex-shrink-0 space-y-2">
            {fuelMode === "ev" ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest flex-shrink-0">Radius</span>
                  {[2, 5, 10, 25, 50].map((d) => (
                    <button key={d} onClick={() => changeDistance(d)} className="px-2 py-1 rounded-sm text-[9px] font-mono transition-all" style={{ background: distKm === d ? "#C2FF3D" : "#1A1E24", color: distKm === d ? "#0A0D10" : "#7A828E", border: `1px solid ${distKm === d ? "transparent" : "rgba(255,255,255,0.07)"}` }}>{d}km</button>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest flex-shrink-0">Plug</span>
                  {["All", "CCS", "CHAdeMO", "Type 2", "NACS", "J1772"].map((f) => {
                    const col = f === "All" ? "#C2FF3D" : CONNECTOR_COLORS[f] || "#C2FF3D";
                    return <button key={f} onClick={() => setConnFilter(f)} className="px-2 py-1 rounded-sm text-[9px] font-mono tracking-wide transition-all" style={{ background: connFilter === f ? col : "#1A1E24", color: connFilter === f ? "#0A0D10" : "#7A828E", border: `1px solid ${connFilter === f ? "transparent" : "rgba(255,255,255,0.07)"}` }}>{f}</button>;
                  })}
                </div>
              </>
            ) : (
              <>
                {/* City quick-select */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest flex-shrink-0">City</span>
                  <div className="flex gap-1 flex-wrap">
                    {INDIA_CITIES.map((city) => (
                      <button key={city} onClick={() => selectEthCity(city)} className="px-2 py-1 rounded-sm text-[9px] font-mono transition-all" style={{ background: ethanolCity === city ? "#4ADE80" : "#1A1E24", color: ethanolCity === city ? "#064e3b" : "#7A828E", border: `1px solid ${ethanolCity === city ? "transparent" : "rgba(255,255,255,0.07)"}`, fontWeight: ethanolCity === city ? 700 : 400 }}>
                        {city.length > 8 ? city.substring(0, 8) + "…" : city}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Blend filter */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest flex-shrink-0">Blend</span>
                  {["All", "E20", "E50", "E85", "E100"].map((f) => {
                    const col = f === "All" ? "#4ADE80" : BLEND_COLORS[f] || "#4ADE80";
                    return <button key={f} onClick={() => setBlendFilter(f)} className="px-2 py-1 rounded-sm text-[9px] font-mono font-bold transition-all" style={{ background: blendFilter === f ? col : "#1A1E24", color: blendFilter === f ? "#064e3b" : "#7A828E", border: `1px solid ${blendFilter === f ? "transparent" : "rgba(255,255,255,0.07)"}` }}>{f}</button>;
                  })}
                </div>
              </>
            )}
          </div>

          {/* Cheapest per km panel */}
          <CheapestPerKmPanel city={priceCity} prices={currentPrices} symbol={currencySymbol} />

          {/* Station / pump list */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#C2FF3D20 transparent" }}>
            {fuelMode === "ev" ? (
              /* ── EV list ── */
              step === "initial" || step === "denied" ? (
                <div className="flex flex-col items-center justify-center h-full px-6 py-8 gap-4 text-center">
                  {step === "denied" ? (
                    <>
                      <AlertCircle className="w-10 h-10 text-accent opacity-60" />
                      <div className="text-sm font-medium text-foreground">Location denied</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">Enable location in browser settings, or search any city above.</div>
                      <button onClick={requestGPS} className="px-5 py-2.5 rounded-md text-xs font-mono uppercase tracking-widest" style={{ background: "#C2FF3D", color: "#0A0D10" }}>Try Again</button>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(194,255,61,0.08)", border: "2px solid rgba(194,255,61,0.2)" }}>
                        <Zap className="w-7 h-7 text-primary" />
                      </div>
                      <div>
                        <div className="text-base font-heading font-bold mb-1">Find EV Chargers</div>
                        <div className="text-xs text-muted-foreground leading-relaxed">Share location for nearest stations, or search any city worldwide.</div>
                      </div>
                      <button onClick={requestGPS} className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-mono uppercase tracking-widest w-full justify-center active:scale-95 transition-all" style={{ background: "#C2FF3D", color: "#0A0D10", boxShadow: "0 0 24px rgba(194,255,61,0.2)" }}>
                        <Navigation className="w-4 h-4" /> Share My Location
                      </button>
                    </>
                  )}
                </div>
              ) : step === "requesting" ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="relative w-12 h-12">
                    <div className="absolute inset-0 rounded-full animate-ping" style={{ background: "rgba(194,255,61,0.2)" }} />
                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(194,255,61,0.1)", border: "2px solid rgba(194,255,61,0.3)" }}>
                      <Navigation className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground font-mono">Getting your location…</div>
                </div>
              ) : filteredEV.length === 0 && !evFetching ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
                  <Zap className="w-7 h-7 text-muted-foreground/40" />
                  <div className="text-sm text-muted-foreground">No stations within {distKm} km</div>
                  <button onClick={() => changeDistance(distKm * 2)} className="text-xs font-mono text-primary hover:underline">Try {distKm * 2} km →</button>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {filteredEV.map((s, i) => {
                    const conns = getConnectors(s); const power = getMaxPower(s);
                    const op = isOperational(s); const dist = fmtDist(s.AddressInfo.Distance);
                    const col = CONNECTOR_COLORS[conns[0]] || "#C2FF3D"; const isAct = activeEVStation === s.ID;
                    const pts = s.NumberOfPoints ?? 0;
                    const isPopular = pts >= 4;
                    // Estimate charging price from power level
                    const estPriceKwh = power >= 100 ? currentPrices.evDCFast : power >= 22 ? currentPrices.evACPublic : currentPrices.evHome;
                    const priceStr = s.UsageCost && s.UsageCost.length < 20 ? s.UsageCost : `~₹${estPriceKwh}/kWh`;
                    return (
                      <motion.div key={s.ID} className="px-4 py-3 border-b border-border cursor-pointer transition-all duration-150" style={{ background: isAct ? "#1A1E24" : "transparent" }}
                        onClick={() => { setActiveEVStation(s.ID); setMapAction({ lat: s.AddressInfo.Latitude, lng: s.AddressInfo.Longitude, zoom: 16 }); }}
                        onMouseEnter={() => setActiveEVStation(s.ID)} onMouseLeave={() => setActiveEVStation(null)}
                        initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ delay: Math.min(i * 0.025, 0.25), duration: 0.25 }}>
                        <div className="flex items-start gap-3">
                          <div className="relative flex-shrink-0 mt-0.5">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: op ? col + "18" : "#52575E18", border: `1.5px solid ${op ? col + "40" : "#52575E40"}` }}>
                              <Zap className="w-3.5 h-3.5" style={{ color: op ? col : "#52575E" }} strokeWidth={2.5} />
                            </div>
                            {isPopular && <span className="absolute -top-1 -right-1 text-[7px] leading-none px-1 py-0.5 rounded-full font-bold font-mono" style={{ background: "#FF8A3D", color: "#fff" }}>🔥</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-xs font-medium text-foreground leading-snug line-clamp-1">{s.AddressInfo.Title}</span>
                              {dist && <span className="text-[10px] font-mono text-primary flex-shrink-0 ml-1">{dist}</span>}
                            </div>
                            {s.AddressInfo.Town && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{[s.AddressInfo.AddressLine1, s.AddressInfo.Town].filter(Boolean).join(", ")}</div>}
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {conns.slice(0, 3).map((c) => <ConnectorBadge key={c} type={c} />)}
                              {power > 0 && <span className="text-[10px] font-mono text-muted-foreground">{power}kW</span>}
                              <span className="text-[10px] font-mono ml-auto font-bold" style={{ color: "#C2FF3D" }}>{priceStr}</span>
                            </div>
                            <div className="flex items-center justify-between mt-1.5">
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: op ? "#C2FF3D" : "#FF4D4D" }} />
                                  <span className="text-[10px] font-mono" style={{ color: op ? "#C2FF3D" : "#FF4D4D" }}>{op ? "Operational" : "Unavailable"}</span>
                                </div>
                                {isPopular && <span className="text-[9px] font-mono text-orange-400">{pts} points · Popular</span>}
                              </div>
                              <a href={mapsUrl(s.AddressInfo.Latitude, s.AddressInfo.Longitude)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] font-mono text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5">
                                Directions <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )
            ) : (
              /* ── Ethanol list ── */
              <AnimatePresence mode="popLayout">
                {filteredEth.map((s, i) => {
                  const high = getHighestBlend(s.blends); const col = BLEND_COLORS[high] || "#4ADE80";
                  const isAct = activeEthStation === s.id;
                  const distFromUser = userLoc && isInIndia(userLoc.lat, userLoc.lng) ? haversineKm(userLoc.lat, userLoc.lng, s.lat, s.lng) : null;
                  const isPopular = s.operator === "IOCL" && s.open24h;
                  // Show price for the highest available blend
                  const blendPrice = high === "E100" ? currentPrices.e100 : high === "E85" ? currentPrices.e85 : high === "E50" ? undefined : currentPrices.e20;
                  return (
                    <motion.div key={s.id} className="px-4 py-3 border-b border-border cursor-pointer transition-all duration-150" style={{ background: isAct ? "#161D13" : "transparent" }}
                      onClick={() => { setActiveEthStation(s.id); setMapAction({ lat: s.lat, lng: s.lng, zoom: 16 }); }}
                      onMouseEnter={() => setActiveEthStation(s.id)} onMouseLeave={() => setActiveEthStation(null)}
                      initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ delay: Math.min(i * 0.025, 0.25), duration: 0.25 }}>
                      <div className="flex items-start gap-3">
                        <div className="relative flex-shrink-0 mt-0.5">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: col + "18", border: `1.5px solid ${col}40` }}>
                            <Leaf className="w-3.5 h-3.5" style={{ color: col }} />
                          </div>
                          {isPopular && <span className="absolute -top-1 -right-1 text-[7px] leading-none px-1 py-0.5 rounded-full font-bold font-mono" style={{ background: "#FF8A3D", color: "#fff" }}>🔥</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-xs font-medium text-foreground leading-snug line-clamp-1">{s.name}</span>
                            {distFromUser !== null && <span className="text-[10px] font-mono flex-shrink-0 ml-1" style={{ color: col }}>{distFromUser < 1 ? `${Math.round(distFromUser * 1000)}m` : `${distFromUser.toFixed(1)}km`}</span>}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.address}</div>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {s.blends.map((b) => <BlendBadge key={b} blend={b} />)}
                            {blendPrice && <span className="text-[10px] font-mono font-bold ml-auto" style={{ color: col }}>₹{blendPrice}/L</span>}
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.open24h ? "#4ADE80" : "#7A828E" }} />
                                <span className="text-[10px] font-mono" style={{ color: s.open24h ? "#4ADE80" : "#7A828E" }}>{s.open24h ? "Open 24h" : "Check timing"}</span>
                              </div>
                              {isPopular && <span className="text-[9px] font-mono text-orange-400">Most Used</span>}
                            </div>
                            <a href={mapsUrl(s.lat, s.lng)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] font-mono hover:underline flex items-center gap-0.5" style={{ color: col }}>
                              Directions <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* ── Map ── */}
        <div className="flex-1 relative" style={{ minHeight: "54vh" }}>
          <div ref={mapDivRef} className="w-full h-full" style={{ background: "#0D1017" }} />

          {/* Welcome overlay */}
          <AnimatePresence>
            {step === "initial" && fuelMode === "ev" && (
              <motion.div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none" style={{ background: "rgba(13,16,23,0.55)", backdropFilter: "blur(2px)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="text-center px-6">
                  <div className="font-heading text-3xl sm:text-4xl font-bold text-foreground mb-1">EV CHARGERS<br /><span style={{ color: "#C2FF3D" }}>WORLDWIDE</span></div>
                  <div className="text-sm text-muted-foreground mt-2">Share location or search a city above</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading badge */}
          <AnimatePresence>
            {evFetching && fuelMode === "ev" && (
              <motion.div className="absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono" style={{ background: "#1A1E24", border: "1px solid rgba(194,255,61,0.2)", color: "#C2FF3D" }} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Loader2 className="w-3 h-3 animate-spin" /> Loading stations…
              </motion.div>
            )}
          </AnimatePresence>

          {/* Count badge */}
          {(step === "loaded" && fuelMode === "ev" && !evFetching) && (
            <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-mono" style={{ background: "rgba(20,23,28,0.9)", border: "1px solid rgba(194,255,61,0.15)", color: "#C2FF3D" }}>
              <Zap className="w-3 h-3" />{filteredEV.length} stations · {distKm}km
            </div>
          )}
          {fuelMode === "ethanol" && (
            <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-mono" style={{ background: "rgba(13,20,13,0.92)", border: "1px solid rgba(74,222,128,0.2)", color: "#4ADE80" }}>
              <Leaf className="w-3 h-3" />{filteredEth.length} pumps · {ethanolCity}
            </div>
          )}
        </div>
        </div>{/* end left+map row */}
      </div>

      {/* ══════════════════ INDIA ETHANOL GUIDE ══════════════════ */}
      <section id="ethanol" className="py-20 px-5 lg:px-12" style={{ background: "linear-gradient(180deg, #14171C 0%, #0D1A0E 50%, #14171C 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px opacity-70" style={{ background: "#4ADE80" }} />
              <span className="text-[10px] font-mono tracking-[0.2em] uppercase opacity-80" style={{ color: "#4ADE80" }}>India Biofuel Mission</span>
            </div>
            <h2 className="font-heading text-4xl sm:text-5xl font-bold leading-none tracking-tight text-foreground mb-3">
              INDIA&apos;S ETHANOL<br /><span style={{ color: "#4ADE80" }}>REVOLUTION</span>
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
              PM Modi&apos;s vision: 20% ethanol blending by 2025-26. India is now the world&apos;s 3rd largest ethanol producer. E20 is mandatory, E85 flex-fuel vehicles are on the road, E100 pilots are live.
            </p>

            {/* Timeline chips */}
            <div className="flex flex-wrap gap-2 mt-5">
              {[
                { year: "2013", event: "E5 mandate launched" },
                { year: "2022", event: "E10 nationwide rollout" },
                { year: "Apr 2023", event: "E20 launched — 15 states" },
                { year: "2024", event: "E85 flex-fuel bikes — TVS, Bajaj" },
                { year: "2025–26", event: "E20 pan-India target" },
              ].map(({ year, event }) => (
                <div key={year} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono" style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", color: "#4ADE80" }}>
                  <span className="font-bold">{year}</span>
                  <span className="text-muted-foreground">· {event}</span>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Blend cards */}
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {BLEND_INFO.map((b, i) => (
              <motion.div key={b.id} className="p-5 rounded-lg" style={{ background: "#181C22", border: `1px solid ${b.color}20` }}
                whileHover={{ borderColor: `${b.color}45`, boxShadow: `0 0 30px ${b.color}10` }}
                initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.09, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="font-heading text-2xl font-bold" style={{ color: b.color }}>{b.label}</div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: b.color + "15", color: b.color, border: `1px solid ${b.color}30` }}>{b.icon}</span>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground tracking-wider mb-4">{b.name}</div>
                <div className="space-y-2 mb-4">
                  {[
                    { label: "Mileage impact", val: `${b.mileageAdj}%`, col: b.mileageAdj < -10 ? "#FF8A3D" : "#7A828E" },
                    { label: "CO₂ reduction", val: `~${b.co2Save}%`, col: b.color },
                    { label: "Cost vs petrol", val: `${Math.round((1 - b.blendCostFactor) * 100)}% cheaper`, col: "#4ADE80" },
                  ].map(({ label, val, col }) => (
                    <div key={label} className="flex justify-between text-[10px]">
                      <span className="font-mono text-muted-foreground">{label}</span>
                      <span className="font-mono font-bold" style={{ color: col }}>{val}</span>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] font-mono mb-2" style={{ color: b.color }}>{b.compatible}</div>
                <div className="text-[10px] font-mono text-muted-foreground/70 leading-relaxed">{b.govtTarget}</div>
                <div className="mt-3 text-[11px] text-muted-foreground leading-relaxed">{b.desc}</div>
              </motion.div>
            ))}
          </div>

          {/* Flex-fuel calculator */}
          <Reveal delay={0.1} className="mt-14">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-6 h-px opacity-60" style={{ background: "#4ADE80" }} />
              <span className="text-[10px] font-mono tracking-[0.2em] uppercase opacity-70" style={{ color: "#4ADE80" }}>Flex-Fuel Savings Calculator</span>
            </div>
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Inputs */}
              <div className="space-y-5">
                <h3 className="font-heading text-2xl font-bold text-foreground">HOW MUCH WILL<br /><span style={{ color: "#4ADE80" }}>YOU SAVE?</span></h3>

                {/* Blend selector */}
                <div>
                  <label className="text-[10px] font-mono tracking-[0.18em] uppercase text-muted-foreground block mb-2">Ethanol Blend</label>
                  <div className="grid grid-cols-4 gap-2">
                    {["E20", "E50", "E85", "E100"].map((b) => {
                      const col = BLEND_COLORS[b] || "#4ADE80";
                      return (
                        <button key={b} onClick={() => setSelectedBlend(b)} className="py-2.5 rounded-md text-xs font-mono font-bold transition-all" style={{ background: selectedBlend === b ? col : "#1A1E24", color: selectedBlend === b ? "#064e3b" : "#7A828E", border: `1px solid ${selectedBlend === b ? "transparent" : "rgba(255,255,255,0.06)"}` }}>{b}</button>
                      );
                    })}
                  </div>
                </div>

                {([
                  { label: "Your car's petrol mileage", unit: "km/L", val: baseMileage, set: setBaseMileage, min: 5, max: 35, step: 0.5, fmt: (v: number) => `${v} km/L` },
                  { label: "Daily drive", unit: "km/day", val: dailyDriveKm, set: setDailyDriveKm, min: 5, max: 200, step: 5, fmt: (v: number) => `${v} km` },
                  { label: "Petrol price", unit: "₹/litre", val: petrolPriceINR, set: setPetrolPriceINR, min: 80, max: 130, step: 1, fmt: (v: number) => `₹${v}` },
                  { label: "Ethanol price", unit: "₹/litre", val: ethanolPriceINR, set: setEthanolPriceINR, min: 45, max: 80, step: 1, fmt: (v: number) => `₹${v}` },
                ] as { label: string; unit: string; val: number; set: (v: number) => void; min: number; max: number; step: number; fmt: (v: number) => string }[]).map(({ label, unit, val, set, min, max, step, fmt }) => (
                  <div key={label}>
                    <div className="flex justify-between items-baseline mb-1.5">
                      <label className="text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground">{label}</label>
                      <span className="font-heading text-xl font-bold text-foreground">{fmt(val)}</span>
                    </div>
                    <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ background: `linear-gradient(to right, #4ADE80 ${((val - min) / (max - min)) * 100}%, rgba(255,255,255,0.08) ${((val - min) / (max - min)) * 100}%)` }} />
                    <div className="text-right text-[9px] font-mono text-muted-foreground/50 mt-1">{unit}</div>
                  </div>
                ))}
              </div>

              {/* Results */}
              <div className="space-y-4">
                {/* Big savings */}
                <div className="p-6 rounded-lg text-center" style={{ background: "linear-gradient(135deg, #181C22 0%, #0D1A0E 100%)", border: "1px solid rgba(74,222,128,0.2)" }}>
                  <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-muted-foreground mb-2">Monthly Savings on {selectedBlend}</div>
                  <motion.div key={Math.round(monthlySavingsINR)} className="font-heading text-6xl font-bold leading-none tabular-nums"
                    style={{ color: monthlySavingsINR >= 0 ? "#4ADE80" : "#FF4D4D", textShadow: `0 0 40px ${monthlySavingsINR >= 0 ? "#4ADE8045" : "#FF4D4D45"}` }}
                    initial={{ scale: 0.92 }} animate={{ scale: 1 }} transition={{ duration: 0.2 }}>
                    ₹{Math.abs(monthlySavingsINR).toFixed(0)}
                  </motion.div>
                  <div className="text-xs font-mono text-muted-foreground mt-2">{monthlySavingsINR >= 0 ? `saved per month vs pure petrol` : "costs more than pure petrol"}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: `${selectedBlend} price/L`, val: `₹${blendLiterCost.toFixed(1)}`, col: BLEND_COLORS[selectedBlend] || "#4ADE80" },
                    { label: "Effective mileage", val: `${effectiveMileage.toFixed(1)} km/L`, col: "#4ADE80" },
                    { label: "Annual savings", val: `₹${Math.abs(monthlySavingsINR * 12).toFixed(0)}`, col: "#4ADE80" },
                    { label: "CO₂ saved / mo", val: `${co2SavedKgMonth.toFixed(1)} kg`, col: "#22C55E" },
                    { label: `${selectedBlend} per km`, val: `₹${blendCostPerKmINR.toFixed(2)}`, col: BLEND_COLORS[selectedBlend] || "#4ADE80" },
                    { label: "Petrol per km", val: `₹${petrolCostPerKmINR.toFixed(2)}`, col: "#FF8A3D" },
                  ].map(({ label, val, col }) => (
                    <div key={label} className="px-4 py-3 rounded-md" style={{ background: "#181C22", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div className="text-[9px] font-mono uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
                      <div className="font-heading text-base font-bold mt-1" style={{ color: col }}>{val}</div>
                    </div>
                  ))}
                </div>

                <div className="px-4 py-3 rounded-md text-xs text-muted-foreground leading-relaxed" style={{ background: "#181C22", border: "1px solid rgba(74,222,128,0.08)" }}>
                  <span style={{ color: "#4ADE80" }}>Note:</span> {selectedBlend === "E20" ? "E20 works in all BS6 petrol vehicles (2020+) — no engine changes needed." : selectedBlend === "E85" || selectedBlend === "E50" ? `${selectedBlend} requires a Flex-Fuel Vehicle (FFV). Available from TVS, Bajaj, and select Toyota/Suzuki models in India.` : "E100 requires a specially designed engine. Currently in pilot phase in India (IOCL — Lucknow, Pune)."}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════ RANGE CALCULATOR ══════════════════ */}
      <section id="range" className="py-20 px-5 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <SectionLabel eyebrow="EV Range Calculator" />
            <h2 className="font-heading text-4xl sm:text-5xl font-bold leading-none tracking-tight text-foreground mb-3">HOW FAR CAN<br /><span style={{ color: "#C2FF3D" }}>YOU GO?</span></h2>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">Pick your EV model, set your current charge, choose your driving style. Know your range before you leave.</p>
          </Reveal>
          <Reveal delay={0.1} className="mt-10">
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-mono tracking-[0.18em] uppercase text-muted-foreground block mb-2">EV Model</label>
                  <div className="relative">
                    <select value={model.id} onChange={(e) => setModel(EV_MODELS.find((m) => m.id === e.target.value) || EV_MODELS[0])} className="w-full px-4 py-3 rounded-md text-xs font-mono outline-none appearance-none cursor-pointer" style={{ background: "#1A1E24", border: "1px solid rgba(194,255,61,0.12)", color: "#F3F1EA" }}>
                      {EV_MODELS.map((m) => <option key={m.id} value={m.id} style={{ background: "#1A1E24" }}>{m.brand} {m.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-mono tracking-[0.18em] uppercase text-muted-foreground">Current Charge</label>
                    <span className="font-heading text-2xl font-bold text-primary leading-none">{battPct}%</span>
                  </div>
                  <input type="range" min={5} max={100} value={battPct} onChange={(e) => setBattPct(Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #C2FF3D ${battPct}%, rgba(255,255,255,0.08) ${battPct}%)` }} />
                  <div className="flex justify-between text-[9px] font-mono text-muted-foreground/60 mt-1"><span>5%</span><span>100%</span></div>
                </div>
                <div>
                  <label className="text-[10px] font-mono tracking-[0.18em] uppercase text-muted-foreground block mb-2">Driving Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["City", "Highway", "Mixed"] as const).map((m) => (
                      <button key={m} onClick={() => setDriveMode(m)} className="py-2.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all" style={{ background: driveMode === m ? "#C2FF3D" : "#1A1E24", color: driveMode === m ? "#0A0D10" : "#7A828E", border: `1px solid ${driveMode === m ? "transparent" : "rgba(255,255,255,0.06)"}` }}>{m}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-3 rounded-md" style={{ background: "#1A1E24", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div><div className="text-xs font-mono text-foreground">Air Conditioning</div><div className="text-[10px] text-muted-foreground mt-0.5">Reduces range ~12%</div></div>
                  <button onClick={() => setAcOn(!acOn)} className="relative w-11 h-6 rounded-full transition-all duration-300" style={{ background: acOn ? "#C2FF3D" : "rgba(255,255,255,0.08)" }}>
                    <div className="absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300" style={{ left: acOn ? "22px" : "2px", background: acOn ? "#0A0D10" : "#7A828E" }} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[{ label: "Battery", val: `${model.batteryKwh} kWh` }, { label: "WLTP Range", val: `${model.rangeKm} km` }].map(({ label, val }) => (
                    <div key={label} className="px-4 py-3 rounded-md" style={{ background: "#1A1E24", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
                      <div className="font-heading text-lg font-bold text-foreground mt-1">{val}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-center justify-center gap-7">
                <div className="text-center">
                  <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-muted-foreground mb-3">Estimated Range</div>
                  <motion.div key={estimatedRange} className="font-heading font-bold leading-none tabular-nums" style={{ fontSize: "clamp(88px,16vw,148px)", color: rangeColor, textShadow: `0 0 60px ${rangeColor}40` }} initial={{ scale: 0.93, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.25 }}>{estimatedRange}</motion.div>
                  <div className="text-sm font-mono text-muted-foreground mt-1">kilometres</div>
                </div>
                <div className="w-full max-w-xs">
                  <div className="flex justify-between text-[9px] font-mono text-muted-foreground/60 mb-1.5"><span>0 km</span><span>700 km</span></div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <motion.div className="h-full rounded-full" style={{ background: rangeColor, boxShadow: `0 0 8px ${rangeColor}` }} animate={{ width: `${Math.min((estimatedRange / 700) * 100, 100)}%` }} transition={{ duration: 0.35, ease: "easeOut" }} />
                  </div>
                </div>
                <div className="w-full max-w-xs px-4 py-3 rounded-md text-xs" style={{ background: "#1A1E24", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <span className="text-muted-foreground">
                    {driveMode === "City" && "City driving benefits from regen braking — often exceeds WLTP estimates."}
                    {driveMode === "Highway" && "Higher speeds increase drag and reduce range below WLTP figures."}
                    {driveMode === "Mixed" && "Mixed driving closely mirrors WLTP test conditions."}
                    {acOn && " AC load subtracted."}
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════ COST CALCULATOR ══════════════════ */}
      <section id="cost" className="py-20 px-5 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <SectionLabel eyebrow="Cost Calculator" />
            <h2 className="font-heading text-4xl sm:text-5xl font-bold leading-none tracking-tight text-foreground mb-3">CHARGING<br /><span style={{ color: "#C2FF3D" }}>vs PETROL</span></h2>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">Enter your local prices and see exactly how much you save annually driving electric.</p>
          </Reveal>
          <Reveal delay={0.1} className="mt-10">
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                {([
                  { label: "Electricity Price", unit: "USD / kWh", raw: elecPrice, set: setElecPrice, min: 0.05, max: 0.8, step: 0.01, fmt: (v: number) => `$${v.toFixed(2)}` },
                  { label: "Petrol Price", unit: "USD / litre", raw: petrolPrice, set: setPetrolPrice, min: 0.5, max: 4, step: 0.05, fmt: (v: number) => `$${v.toFixed(2)}` },
                  { label: "Petrol Car Efficiency", unit: "km / litre", raw: petrolEffic, set: setPetrolEffic, min: 5, max: 25, step: 0.5, fmt: (v: number) => `${v} km/L` },
                  { label: "Daily Distance", unit: "km / day", raw: dailyKm, set: setDailyKm, min: 10, max: 300, step: 5, fmt: (v: number) => `${v} km` },
                ] as { label: string; unit: string; raw: number; set: (v: number) => void; min: number; max: number; step: number; fmt: (v: number) => string }[]).map(({ label, unit, raw, set, min, max, step, fmt }) => (
                  <div key={label}>
                    <div className="flex justify-between items-baseline mb-2">
                      <label className="text-[10px] font-mono tracking-[0.18em] uppercase text-muted-foreground">{label}</label>
                      <span className="font-heading text-xl font-bold text-foreground">{fmt(raw)}</span>
                    </div>
                    <input type="range" min={min} max={max} step={step} value={raw} onChange={(e) => set(Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #C2FF3D ${((raw - min) / (max - min)) * 100}%, rgba(255,255,255,0.08) ${((raw - min) / (max - min)) * 100}%)` }} />
                    <div className="text-right text-[9px] font-mono text-muted-foreground/50 mt-1">{unit}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                <div className="p-6 rounded-lg text-center" style={{ background: "linear-gradient(135deg,#181C22 0%,#0F1410 100%)", border: "1px solid rgba(194,255,61,0.18)" }}>
                  <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-muted-foreground mb-3">Annual Savings</div>
                  <motion.div key={Math.round(annualSavings)} className="font-heading text-6xl font-bold leading-none tabular-nums" style={{ color: annualSavings >= 0 ? "#C2FF3D" : "#FF4D4D", textShadow: annualSavings >= 0 ? "0 0 40px #C2FF3D45" : "0 0 40px #FF4D4D45" }} initial={{ scale: 0.92 }} animate={{ scale: 1 }} transition={{ duration: 0.2 }}>${Math.abs(annualSavings).toFixed(0)}</motion.div>
                  <div className="text-xs font-mono text-muted-foreground mt-2">{annualSavings >= 0 ? "saved per year vs petrol" : "more expensive than petrol"}</div>
                </div>
                <div className="space-y-3">
                  {[{ label: "EV monthly fuel cost", val: evMonthly, color: "#C2FF3D" }, { label: "Petrol monthly fuel cost", val: petrolMonthly, color: "#FF8A3D" }].map(({ label, val, color }) => (
                    <div key={label} className="p-4 rounded-md" style={{ background: "#1A1E24", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
                        <span className="font-heading text-xl font-bold" style={{ color }}>${val.toFixed(0)}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <motion.div className="h-full rounded-full" style={{ background: color }} animate={{ width: `${(val / maxMonthly) * 100}%` }} transition={{ duration: 0.35 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "EV per km", val: `$${evCostPerKm.toFixed(3)}`, color: "#C2FF3D" },
                    { label: "Petrol per km", val: `$${petrolCostPerKm.toFixed(3)}`, color: "#FF8A3D" },
                    { label: "Monthly savings", val: `$${Math.abs(petrolMonthly - evMonthly).toFixed(0)}`, color: "#C2FF3D" },
                    { label: "CO₂ avoided/yr", val: `~${(dailyKm * 365 * 0.21 / 1000).toFixed(1)}t`, color: "#3DBAFF" },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="px-4 py-3 rounded-md" style={{ background: "#1A1E24", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
                      <div className="font-heading text-base font-bold mt-1" style={{ color }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════ CONNECTOR GUIDE ══════════════════ */}
      <section id="connectors" className="py-20 px-5 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <SectionLabel eyebrow="Connector Guide" />
            <h2 className="font-heading text-4xl sm:text-5xl font-bold leading-none tracking-tight text-foreground mb-3">KNOW YOUR<br /><span style={{ color: "#C2FF3D" }}>CONNECTORS</span></h2>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">Every plug, every speed, every region explained — never confused at a charging point again.</p>
          </Reveal>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CONNECTORS_GUIDE.map((c, i) => (
              <motion.div key={c.id} className="p-6 rounded-lg" style={{ background: "#1A1E24", border: `1px solid ${c.color}18` }}
                whileHover={{ borderColor: `${c.color}45`, boxShadow: `0 0 30px ${c.color}10` }}
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.09, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
                <div className="w-11 h-11 rounded-md flex items-center justify-center mb-5 text-xl font-heading" style={{ background: c.color + "14", border: `1px solid ${c.color}28`, color: c.color }}>{c.icon}</div>
                <div className="font-heading text-xl font-bold mb-0.5" style={{ color: c.color }}>{c.name}</div>
                <div className="text-[9px] font-mono text-muted-foreground tracking-[0.12em] mb-4">{c.fullName}</div>
                <div className="space-y-2 mb-4">{[{ label: "Speed", val: c.speed }, { label: "Regions", val: c.regions }].map(({ label, val }) => (<div key={label} className="flex justify-between gap-2 text-[10px]"><span className="font-mono text-muted-foreground uppercase tracking-wider">{label}</span><span className="font-mono text-foreground/80 text-right">{val}</span></div>))}</div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{c.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ FOOTER ══════════════════ */}
      <footer className="py-12 px-5 lg:px-12 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-8 justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3"><Zap className="w-4 h-4 text-primary" strokeWidth={2.5} /><span className="font-heading text-sm font-bold tracking-[0.15em] uppercase text-primary">ChargeIQ</span></div>
            <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">Real-time EV charging + India ethanol fuel intelligence. Find stations, calculate range, compare costs — at your fingertips.</p>
          </div>
          <div className="grid grid-cols-3 gap-8 text-[11px] font-mono">
            <div>
              <div className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-3">EV Tools</div>
              <div className="space-y-2">{["Station Finder", "Range Calculator", "Cost Calculator", "Connector Guide"].map((t) => (<div key={t} className="text-foreground/50 hover:text-primary cursor-pointer transition-colors">{t}</div>))}</div>
            </div>
            <div>
              <div className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-3" style={{ color: "#4ADE80" }}>Ethanol India</div>
              <div className="space-y-2">{["E20 Pumps", "E85 Stations", "Blend Guide", "Flex-Fuel Calc"].map((t) => (<div key={t} className="text-foreground/50 hover:underline cursor-pointer transition-colors" style={{ "--tw-text-opacity": "1" } as React.CSSProperties}>{t}</div>))}</div>
            </div>
            <div>
              <div className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-3">Data</div>
              <div className="space-y-2">{["Open Charge Map", "OpenStreetMap", "Nominatim API", "NITI Aayog EF"].map((t) => (<div key={t} className="text-foreground/50">{t}</div>))}</div>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-border flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
          <span className="text-[10px] font-mono text-muted-foreground/50">© 2024 ChargeIQ · EV & Ethanol Intelligence</span>
          <span className="text-[10px] font-mono text-muted-foreground/40">EV data: OCM (CC BY-SA) · Ethanol: IOCL/BPCL/HPCL · Range: WLTP</span>
        </div>
      </footer>
    </div>
  );
}
