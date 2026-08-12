// The demo seeder's route geometry (RUN-77 decision 5): 8 real Zagreb
// running routes as encoded polylines, checked in as constants.
//
// GENERATED, and regenerable: `node scripts/plan-demo-routes.mjs --write`. That
// script holds the coordinates, the provider choice and the reasoning behind
// both; add a route there rather than hand-encoding a polyline here.
//
// WHY CONSTANTS AND NOT A ROUTING CALL. RUN-71's seeder has two hard properties
// - it is deterministic (same `today`, same dataset, down to the last note) and
// it works offline on a fresh clone with no API key. A call to openrouteservice
// from the seeder would break both, and would make ROUTING_API_KEY required for
// seeding when RUN-53 deliberately kept it optional. So the routing happened
// once, at authoring time, and this is its output.
//
// WHAT EVERY ENTRY HAS TO SATISFY, because nothing at runtime re-checks it - the
// seeder writes rows straight through Prisma, bypassing RunRouteDto entirely:
//   - the polyline decodes at PRECISION 5 (runs/route-trim.ts) and is at most
//     ROUTE_POLYLINE_MAX_LENGTH (20 000) characters
//   - waypoints number MIN_ROUTE_POINTS..MAX_ROUTE_POINTS (2-5)
//   - every decoded point is inside ZAGREB_BOUNDS (AC7)
//   - `name` describes where the geometry actually goes (AC7 again - the comment
//     on each entry is there so a reader can check that claim without decoding
//     anything)
//   - `distanceKm` is the decoded line's OWN length, which is why a run that
//     gets a route takes its distance from here rather than keeping the
//     generated one (demo-data.ts withRoute)
// demo-data.spec.ts asserts all of it, so a ninth route that breaks any of them
// fails the suite rather than the demo.
//
// Ordered by distance, shortest first: demo-data.ts hands them out in this order
// so the shorter routes land on the beginner accounts, and a sorted table makes
// that - and the spread it depends on - readable.

// One prepared route. Deliberately mirrors the three Run route columns plus the
// two things a run needs, and nothing else: this is data, and every decision
// about which run gets which route lives in demo-data.ts.
export interface DemoRoute {
  // Becomes Run.routeName as well as the event map's legend label, so it is the
  // one string that has to agree with the geometry.
  name: string;
  // The decoded line's own length in km, rounded to one decimal - the same
  // precision Run.distanceKm carries.
  distanceKm: number;
  // Encoded, precision 5. Becomes Run.routePolyline.
  polyline: string;
  // The tapped points: [0] is Start, the last is Finish. Becomes
  // Run.routeWaypoints (a JSONB column).
  waypoints: readonly { readonly lat: number; readonly lng: number }[];
}

// The box AC7 means by "the Zagreb area" - generous enough to hold Sljeme on
// Medvednica in the north and the Sava embankment out east. Exported because the
// constraint belongs to the data rather than to the test that checks it.
export const ZAGREB_BOUNDS = {
  minLat: 45.65,
  maxLat: 45.95,
  minLng: 15.75,
  maxLng: 16.2,
} as const;

export const DEMO_ROUTES: readonly DemoRoute[] = [
  {
    // the path around the Bundek lake, south of the Sava.
    name: 'Bundek loop',
    distanceKm: 2.5,
    waypoints: [
      { lat: 45.78, lng: 15.988 },
      { lat: 45.7778, lng: 15.9905 },
      { lat: 45.7775, lng: 15.9965 },
      { lat: 45.7805, lng: 15.9955 },
      { lat: 45.7803, lng: 15.9885 },
    ],
    polyline:
      'qklvGotq`BZl@d@mAJWn@cBZg@DM?Op@AF?F?L?v@?VA?UCwBCIECBMJ?NAN?@@BEB??K?eAr@AHAF?h@AAs@?OH?JCHBZ?Ao@Ac@B?BA@C@C@C?C?EAEAC`@u@CK?A?ID?AeAA{D@]?_@?g@?Q?OA}@?QCO?kAAw@?SAsA?[SUGICI?MAg@?i@Ai@i@@h@A?[?YmABc@@Q?E?U@O@O?w@D@TA?E?A?G?@~@@Xi@Bg@@g@??x@}@B]@@`@cDDC??T?UB?bDEZA|@Af@ApAABV@P@hC@B@bA?PBrC?T@hAB`B?L?FAFCDD?@N?HTz@FX@J?JCZKCIAM@MAMAOAA@G?CAGAK@QBOFC@KJa@\\CRGt@CVw@HoBV?p@?H?N@N?L?P?^LA?F?D?HAXEf@Ir@OtALd@IX',
  },
  {
    // the park's outer paths, from the main entrance and back.
    name: 'Maksimir park loop',
    distanceKm: 3.3,
    waypoints: [
      { lat: 45.818, lng: 16.015 },
      { lat: 45.823, lng: 16.014 },
      { lat: 45.8265, lng: 16.02 },
      { lat: 45.8215, lng: 16.0235 },
      { lat: 45.8183, lng: 16.0157 },
    ],
    polyline:
      '{ysvG{}v`B_@a@G_ACOgCz@CBAD?BA?E?C@G@CEc@NQcAA@C@GBIBC@GGGG??A?CCA@CDc@g@CDKTk@\\s@K[KMEGNWb@UPA@YFo@C]CwAG[\\URIHQNsA|@aA|@QN[VNt@Ou@G]KcAGoAAy@G_AUm@Yw@SqBMmAq@wCO_@Q[QUYQMyBEe@AO@K?I?UEUE@UHSBa@Te@Xc@VWJYo@Ua@eAb@a@L_BGV}@d@q@T]zA}Af@m@^_@bBwA?SBYHWHQX]`@U`@Q@[?sAFe@AQ@a@h@[|@_@JAV@Fs@Dy@?}@?wALgALID@FDBBAFr@d@DAFDZR@EPLFDBDfAp@@CLFNLXX\\RTJPFb@TCHAHCFBDHXIYCEBG@IBIJFNHDD~@nGNfADX@A@?FCBTDZ\\zBt@nFz@dGdCfQFCBA@APbAb@OBDFABAD?@??C@EBCfC{@',
  },
  {
    // up through the Tuškanac woods above Ilica and back down.
    name: 'Tuškanac forest trail',
    distanceKm: 5.3,
    waypoints: [
      { lat: 45.8155, lng: 15.972 },
      { lat: 45.823, lng: 15.967 },
      { lat: 45.832, lng: 15.969 },
      { lat: 45.825, lng: 15.976 },
      { lat: 45.816, lng: 15.973 },
    ],
    polyline:
      'uisvGwqn`B^Df@HB@?FMz@_@jBCBDDx@f@TL?BCJCJAFCBOr@Qx@Sv@GNC@KFS@SAC?ANAD?DADIAGAM?EAGAe@EI?OAQEAECCA?EEKCGEECCAGAANS?w@Fk@A_@EoAMSAM@[F_@XKLSXMTQh@?@CF_@GA?GA]@sAB]@oAD_CFq@@iABC?Y@A\\Cb@?P?T@JGFAC?AAIK@ELKd@GRQRDHDRCJCLCBC@GAGAGA]?_@Es@Go@CFHUTKH?D@D@DF@D@FAFEDEB@HVBDPBLPHBLRRb@N`@XfAAFEJR\\EBe@}@q@uAQSOK}@Ms@Q]IyAa@YEUA_AF[?kAIsAKk@ICE@E]My@_@UKKCcAWYIk@G}@Gg@GkDK[Ac@Co@E}AOyE_AmAUaAY{@MoBe@y@Ox@NnBd@BQXoDDc@HiERBHB`@HF@XH?@`@Jj@NPBP@PCLCNINOJUH[MUAAI_@CIJc@J[Vc@`@}@Na@Pg@Vq@BMDKDIJGn@]XWb@Ex@@v@PjAIfAMVGZGxAG\\@d@RF@DANKXUXK\\@t@B\\BDAHKCMKS_@[AEl@S?Ag@IGECGDIHCL?XGHA@G@K@g@FeCzAF?C?G?G?s@}@Ig@FQ?O?WGMCLBVFN?P?f@G|@HF@RBX@NHLHD@D?@AJAJ@^Hd@HJ@BJRBrALF?D?FADCJIFBDBF@PF`AVv@RRFRBN@VBd@Bl@@`@@dABbBB\\BDDFDb@VB@B@BA@DBBBBNNTRNLJHFBD?F?DALIFCF?`@Ab@AR??F?DLb@X`ADNZhAJXBHDDFFHDND\\F\\DpADF?F@IdB?PtBZTB|@Pb@H?G@e@?K@SE?Y?',
  },
  {
    // the lakeside path all the way round Malo and Veliko jezero.
    name: 'Jarun lake loop',
    distanceKm: 6.7,
    waypoints: [
      { lat: 45.7838, lng: 15.906 },
      { lat: 45.78, lng: 15.913 },
      { lat: 45.7805, lng: 15.928 },
      { lat: 45.7855, lng: 15.929 },
      { lat: 45.7845, lng: 15.907 },
    ],
    polyline:
      '{cmvGkqa`BOA_@ImBcBVu@@_@B]I_AIw@@c@JmCCc@UINkAFBd@DZ@h@Cv@S`ASpAK|CALAHIJGFEDGDCDEj@o@\\e@Xi@JYBINm@PaA?AZmAhBuCx@gB^qADe@?AI?A?K@MBKDQLGDI?]ECJMC?FEA?AE?KC?@Q`BYlAWhAg@vAi@lAQZa@r@gArAq@r@GBQJe@Fc@F{@Bk@AiB_@q@Sm@]y@Us@WUIK@[LODqAVK?IIa@W[OWESCQCC@sAEYGWKOGKKYYEIGKIOK[IYCQCOASAa@?e@@WBa@Fe@Nk@BOPLHY|BwGt@{BL]L]J]L]L]J]L]L]zAqE\\_ARk@^iApEsMnF_PlCyHHSzAmE|EsN}ErN{AlEIRAGCKCK?ECCIGEEDKCQS[}@mAYS_@MIAE?G?MFABC?O@K@QUiBaBGGGEAAOOq@m@GECCo@k@CEw@q@BIDKBIBGCAEGEEMOMMMKa@]GIi@e@e@a@EGGEGEEE@ABE\\cADI@EDML_@JWDIEHKVM^ELADEH]bACDA@DDFDFDDFCFCHELCHM^LLDTBZGPKXKX?Ba@zBFVDt@FdE?h@?^@X@PFj@BVHt@?DDp@D|@@Z@|A?X?T?^BtAMlAAHARVFB@l@LAHAHCLe@tANLFJFJDTBX@VEbBEdB?r@CdA@ZDV^ZPNGPIRGRENITDDFDBD@?u@zB}@jCEL?@KZM\\M\\K\\M\\GTCFM\\KXABO\\kAdD{@jC[dAKXCNOj@Gd@C`@AV?d@@`@@RBNBPHXJZHNFJDHXXJJNFVJXFrADBAPBRBVDZN`@VHHGJGLA@AFDFDJH\\DLd@z@f@t@ZVXJLBnA`@THBb@KlCAb@Hv@@V',
  },
  {
    // the levee path east along the north bank, turning at Most mladosti.
    name: 'Sava embankment out and back',
    distanceKm: 9.9,
    waypoints: [
      { lat: 45.785, lng: 15.931 },
      { lat: 45.7875, lng: 15.962 },
      { lat: 45.7885, lng: 15.99 },
      { lat: 45.7875, lng: 15.962 },
      { lat: 45.7852, lng: 15.9315 },
    ],
    polyline:
      '{jmvG{of`B?EHCFCFA@AAG@M@KBEACAINOZYLUP[z@cBLQl@a@HGFELKC_@AMOiCWwEYeGE}AC_AAg@?KDsBAu@?w@AQEk@C[?UAc@@m@Ae@?i@AkCCqB?I?q@?k@AcB?gA@s@FwBLiCDi@PyCBg@Bs@D{@Bw@@_A?_@AKAc@?EAu@@QGiA@UC[Eg@Gm@GQGc@Ii@G]Kk@Ke@Ic@ASK[AG??DCGSCIGISc@Ye@SUAAIEKGCAHKDKBSBSBe@C[CUCQESGSQ]Wi@KYSe@KSCEIGUOSKGGCGCI?MB[?G?EAGCA@E@E@IBK??@C?CKIq@i@q@_@X{AHy@?ODEh@sAk@sA]aA?SGu@Ek@?k@BQDMK?GKQq@Q_@S[We@??AC??i@mCEa@Mw@EUISGQQ_@IWQw@aBoI_@sBIk@cAgGg@uCGw@]{Bu@gF_@mCMe@Ic@Im@EaAS_B]wCc@}EWmDGaBGsASaCUwEEgBAcACg@IgCAiBAwBAuAA_@?y@AoAEqACaCAW?y@?a@?WASCuA?e@LgBBk@BY@GEIKEb@kMj@sQJwCtAwORaCS`CuAvOKvCk@rQc@jMJDDHAFCXCj@MfB?d@BtA@R?V?`@?x@@VB`CDpA@nA?x@@^@tA@vB@hBHfCBf@@bADfBTvER`CFrAF`BVlDb@|E\\vCR~AD`AHl@Hb@Ld@^lCt@fF\\zBFv@f@tCbAfGHj@^rB`BnIPv@HVP^FPHRDTLv@D`@h@lC??@B??Vd@RZP^Pp@FJJ?ELCP?j@Dj@Ft@?R\\`Aj@rAi@rAED?NIx@YzAp@^p@h@JH?BAB??CJAHADADB@@?LHFBCJEP?JBHBFFFFB??NJDB@@JJFBDBBBDFFJb@~@b@jAJb@@DDR?T?T?N?PARIl@CTRTXd@Rb@FHBHFREB??@FJZ@RHb@Jd@Jj@F\\Hh@Fb@?THp@@FFt@BRFhABN@t@@`@?FCL?^A~@Cv@Ez@Cr@Cf@QxCEh@MhCGvBAr@?fA@bB?j@?p@?HBpB@jC?h@Gf@?X?^@d@Dr@?l@@v@QD@t@?R?p@BjBHvCPvDHhALfCEA?DABAFEHAHCHANCLCJEJAHE`@y@rBeBbDEDE@ECEFEJOXKP',
  },
  {
    // the classic climb from Gračani up to the Sljeme peak, one way.
    name: 'Sljeme hill climb',
    distanceKm: 13.8,
    waypoints: [
      { lat: 45.848, lng: 15.974 },
      { lat: 45.87, lng: 15.97 },
      { lat: 45.9075, lng: 15.9635 },
    ],
    polyline:
      'isyvGivn`BKDWNMJYVQHgAb@a@HOFIJKHa@VaAn@[Xg@V_AZ_@XMFk@De@H_AXc@N_@ZILIJKRGHGFEBGDI@G?E?GCKAGCCEAE?EC?IBGAIAICICIEGGKIIGIGEACAEAGAG@G@GFCBA@CBEFIJA@GFIJIJGHA@KJKLKHKHIDIDGBEBOFMFQFOFMDC@CBAAE?G@IBK@OBQBSBU?K?m@KQAEAYCSAo@AW?W?Q?q@?M@m@?o@Be@@Q@S@M?M?Q?K@G@QBG@u@L_@D_@Ba@AWCMCMCMIKIIMGSCGCKGWI_@Ie@GYCYCYAMAS@MMCKAa@ISESGOEOCQAO?Q@U@WBSBOFKFGFENGRGVEPARATAb@Aj@Cd@ALu@fCWfFKjAIZMTSRKXG\\E\\Wx@g@nBa@hAm@zAWZUXMRg@rAeAjBWh@CTGd@ShAUtAAl@?v@KbAi@zCMx@Gd@KR[b@Qb@i@dAm@fAaAjAOJSBKAKDWFi@Vm@Vu@Rw@\\WBc@CYFm@XU@iAHO?UEUAOK[UQWYK[M[YUSMUIk@CI?I@Ig@Cg@C]A}@KcACmAFkAKW@m@EIC@UI_@YsAw@eAC_@GkCFc@HOb@Ip@g@ZAXF`A?X@v@[GOOeBMwAWeBIFc@Fy@Hq@@w@IiAC_@Ec@EaAUo@UYMe@Se@]QBQFMBm@Ne@?e@BYSQOUOt@Cd@If@m@\\{@~AgEb@}DYUAmALa@TYf@YXIXUf@y@`@i@p@]l@g@Z}@Rk@RKbAAt@Qd@W^g@NCOB_@f@e@Vu@PcA@SJGDKOCYTi@Vs@CQEIOCSb@q@Li@x@q@nAu@|ASPOCCOCM?QGaAQO{A^m@T[n@u@j@[^_@t@cAf@w@bAOn@a@ZmAd@AGmBKc@MuFeCi@M]R[P}AzAWVg@b@a@v@GRIr@Gt@Oh@e@dASZWLaAHk@?YJa@TQ`@k@`BO\\UHIFa@\\QPELMHOFSHa@Jg@H]@]BW@KAMCU@]F[@K@S?_A?_@Be@HcABOBQJKJKJSNOHQJORKLOFOH_@R]Nk@Lc@Ji@Fa@MUDa@N]^KLc@Rc@V[Tk@i@e@?e@Au@Jk@H[n@UxA[m@_AeAC]LU?OQ@QJQNKj@K\\Gh@IVOJKBC]OAY?k@DCEUJM@]DGBG@EDGJMJM?EFS@IHMBQ@A?GAG@CFGX[TQTa@f@k@r@e@z@q@jBEHI@K?GBUHWNWTQVMNITGVIZIZKZITQ^Q^SX[`@YZe@j@W\\ORWVWROHYL[Tu@p@c@^OVIRGZCXCXCn@?ZCTC\\CTG^GRGNIJGDGBI@MAQIi@M_@IOAM@KBIDGLCHMj@Kf@Mp@IZWx@KPMJQHWHSHWBe@D[HKFURWXY\\YZKBIAGCIIKKKKICQAQ?U@KAIAEAEGEKCKEMAM?I@IBMDKJ]Pc@DQBQ@QFo@BYBY?ICGEKCEECE?C?EBEBGHELSLKHGFKHKFQDG@KAMCIGIKGMEUQNi@b@]ZQNKJa@FaAPo@Aw@JMHK[CGEGOWMy@Ww@i@_Bw@oAq@wAu@sAc@oBOwEa@kAEeAGu@@m@a@}@Oq@Kw@CYAc@CwCUwGIe@UQa@M[MSSEUEYAY@]D_@UKUKUOQOKIIGYUSMUOe@GaAEY?[C_@IYKa@Ye@i@[[_@k@Sc@I]Aa@Ai@@MBGBMBEFEFCLELCh@MVIVSb@]NQPYVs@Ri@Xq@Rc@VWf@_@BCXWZYRYPWVa@P[Te@JYJYD_@As@CWCGCMKYUWOOqAwAYi@c@i@g@g@_BiA_@Ua@U_@O]QMOKUIe@A_@DULa@`@o@^q@J]DWAWGWKSQGWCYA_@CUEIGIKEOAO?MCoAGu@EQIOQOSOOEk@KMCOKIQMa@a@}BSq@OWOKQGO@SFMHINK\\aA|DGVYb@c@j@y@lAw@pBSd@Y\\WPa@R]Jc@Fa@DSCEd@?b@VbA\\d@Hb@Ch@p@fDd@rB?hAP`AEz@JNNRA|@Tp@_@zBB|@K|@Yv@Dj@W`ABj@GjABr@TJnAdAx@NdAUd@[Fv@X~@d@l@T`Ap@Xd@`@Jz@d@t@j@|@\\V',
  },
  {
    // east on the north bank, back west on the south, crossing twice.
    name: 'Sava bridges loop',
    distanceKm: 14.6,
    waypoints: [
      { lat: 45.785, lng: 15.931 },
      { lat: 45.788, lng: 15.986 },
      { lat: 45.779, lng: 15.988 },
      { lat: 45.777, lng: 15.93 },
      { lat: 45.7852, lng: 15.9315 },
    ],
    polyline:
      '{jmvG{of`B?EHCFCFA@AAG@M@KBEACAINOZYLUP[z@cBLQl@a@HGFELKC_@AMOiCWwEYeGE}AC_AAg@?KDsBAu@?w@AQEk@C[?UAc@@m@Ae@?i@AkCCqB?I?q@?k@AcB?gA@s@FwBLiCDi@PyCBg@Bs@D{@Bw@@_A?_@AKAc@?EAu@@QGiA@UC[Eg@Gm@GQGc@Ii@G]Kk@Ke@Ic@ASK[AG??DCGSCIGISc@Ye@SUBUHm@@S?Q?O?U?UESAERQHGBCV?LGCqAUk@Wi@_@GCQAK?S?MBE@G@G?M@GBGNY??`IsJDECGCG@EBE@EBI?I?E?ECGCGa@u@a@y@g@_AQ[IQI_@QsASqACICKMe@Oi@wAsDm@aC]cBs@kEIa@k@iDYgB[gBYgB[gBMs@IQWi@OMGAy@yHm@aF{@_Ic@gF]wF[oFWqHOmGAeCAgCCoG?_C?kB?k@BeCHyGFcFNsEViGN{COzCWhGOrEGbFIxGCdCJ`@HTDH@?HSDQBEFKAICGAGAI?E?Q?Q?I?GNaH@i@BwBDeB@YHwADmADo@b@UTIPIPGFGFGFAL?D?DCHCLEAa@F]Hm@Rs@JONORINGPAPAHCNFl@Sf@Y^Jx@VND~@[x@[TO`@Yh@u@Xc@V]PMH@NDN?JAb@E@EH@L?J@P?rBAD?b@AZ?ZA^?H?LAD?lBG?VD?F?DAh@ADANGR?FA@?DLPA`EMX?AeBAiBAaA@`A@hB@dB@`@Y?gBB{ADa@@c@@C??FB^?vA}CHQ?F~A?DC?WPQJEDIBWXSVQF[Fe@NKDQHe@\\m@V_@DWLOREMGLEH[zBAFAHADAHGp@?T?HCVC^Cn@Ej@CzA?|@?tA?P?N?D?D@d@?P@H@HA?O@S@A?CD?D@R?L@P?V?L@DD?DBBF@H@J?JAJ?D?J?J@H@LABDHJxCFrBB~@J~CBpA?nAEtEAd@?d@?XAnBDlFDzF@dA@v@@`@FlFDnELhE@r@DrC@^@XCHCHCF?@@F@N@D@B@@@B@D?R?RAX?R@VCLEZCN?B?DAFAHCRCNCLAH?NBR@T?R@F?J@P?F?L?F@t@@tA?d@?H?b@Cd@?L?L@?B@Ap@CPG`@Gf@E`@?HAH?P@PBd@@LBb@?N?Z?DAZCh@?JAJCl@?FARARALAHAJAHCJAFGPGVCJCJEXE^ADCTAFCf@C\\ALAJABADEJEDEFEDDR@@ADAF?NFd@A@C@L`ABNBJBJDJDLDHDHFLNV~A|CCDA@?D?D?HCHADCDADBFBFEDaIrJ??OXCFAF?LAFAFCD?L?R@JBP^FVh@Tj@Tl@VV\\PHDHNP^t@`BhAfChAdCNZj@tAl@xAn@`BVz@Nf@R~@VpANdABPVjCDf@Dj@B|Al@BPXFH@@NDXBn@Tv@j@\\^~@vAfEtHnJnOrAdCh@hAHf@NZDLDLJXBLBJ@LH`@Jh@b@fAp@tBTt@x@tD\\vBLbADVANoDlIO^ABAFGCIGi@hACP?TVhATdBg@Nk@f@u@r@[XOL]K]M\\L\\JNMZYt@s@j@g@f@OUeBWiA?UBQh@iAHFFB@G@CN_@KKCCCERg@GG@c@@WBi@LiBBg@@g@Nk@Ho@@}@BiBKuAMu@Ke@?EO_@c@u@o@o@SWSQa@Ks@MeBLyAJsAHk@Bs@BYEYMgAq@SOAAUKYKOCU@_@Jm@^WRUVILm@`ASb@KZAHIb@Gj@A`A?j@?n@@r@Dl@Fh@Jh@Vx@SLUTi@r@ODCDKd@??EBGBA?AECECCEAE?o@HCIG?W?M@O?[SWEI?GBk@TI@I@GAQG[KYA[FYPIDGBWPONMJGDIFm@`@MP{@bBQZMT[XONQNGYGDA@WkAOXKP',
  },
  {
    // the levee path from Jarun west out towards Žitnjak and back.
    name: 'Sava embankment long run',
    distanceKm: 23.6,
    waypoints: [
      { lat: 45.783, lng: 15.885 },
      { lat: 45.787, lng: 15.94 },
      { lat: 45.789, lng: 15.985 },
      { lat: 45.787, lng: 15.94 },
      { lat: 45.7835, lng: 15.886 },
    ],
    polyline:
      'y~lvG{p}_B}BLG@Os@u@{BYwAEe@]}AWyCOoDCqD@gHf@iH~@aG|@oEdBwFhAqC`B{CnDcFXYfAaB^k@z@oAjAwAlAiAbBkB|BmDhC}Ef@gAvAkEbA_ElAuGf@gF`AcJvAcMnAoLJcALQb@mAFQr@EDIFWDOBOReA`@wBPkAzDsRnAiGbAoF^oBhA{Fb@gDn@cGDUb@}FNiI?gGBy@LgAFa@@GLm@J[H]Ra@`@}@IOIWC[O}BEi@XENCBe@CIPSDMQAs@N}Cd@M?IIMeA[}Bk@kDc@}BgAuE_BsFaBiE{A_DoC}EWc@]k@S_@QWEUg@s@GM}HaNiF{IKOkDgGkI{Na@w@GSAQCQA]AWG@E@QFQHGHWi@KW?AWBwCZ}BV_AL{@NsCr@UF???@?@JRBDCBIFSP@DDR?T?T?N?PARIl@CTRTXd@Rb@FHBHFRHZVlAZfBRhAHx@CBABEFABMJJfBDpB@XAtAAv@Cf@Cr@C`@AL?H?@AXGb@GnACTCp@InAItBCpB?~C?VANIHGBk@Aq@MG?u@A?R?F?L?Jg@?eA?kBCE?C?I?O?C@yAAM~@]jCGf@KEGACAOE[KKOEEMc@KGKSA?q@?BiB?M?CAc@?UAG?M?IBsJ@uDB}A?G@I?q@?E?GFm@FW@I@GIEECCCCC@O?KCSAGAK?ECOFINMVYPST[^o@Xk@Pa@Zy@j@eB\\kAPs@Jg@Fa@Fi@Di@Bk@@o@Ac@Ac@Ck@Ei@Is@Iu@EUUeBCQKu@CQAIM_AIs@G_@GYOg@IWO_@MUYe@MUSMa@Wo@_@y@e@MKBI@G@Ex@mDJg@DOBK@K@KAMAUKgB?CAQFCAG?C?KHAZOz@c@DK@ED_@BW@W@GH]BKEORMHEMo@Ka@a@kBcAsEy@}EO}@k@cD??y@aFYiB[sB}@eGOaAa@aDO}Aa@oD[oDWgDEi@U{CSsDOyDGmBEgAIcCEgCGkGAKCqBAi@AsB?eA?E?MAyCAwB@]BUJm@LiA@Q?Eb@kMZ}J[|Jc@jM?DAPMhAKl@CTA\\@vB@xC?L?D?dA@rB@h@BpB@JFjGDfCHbCDfAFlBNxDRrDTzCDh@VfDZnD`@nDN|A`@`DN`A|@dGZrBXhBx@`F??j@bDN|@x@|EbArE`@jBJ`@Ln@h@tBVbAFZFV?@FTBF\\|A@FPh@DP\\hAZhA\\`Aj@rAi@rAED?NIx@YzAKGSKAJA@CHAHCLEAIAEBIHEHCN?PLhAD`@H`@A?MA@FL~@@JBLD^DT?BL|@@HLdA@L@NBXBd@@b@?V?ZAXA\\Cl@Gl@E^G\\G^I\\k@zB_@hA_@fA[v@[l@Wf@[`@UVYXO\\GNGNGRERCNE\\E\\?`BAn@C`BChNF?FA?H?L@F?T@b@?BBCHGrB?r@@h@?M~@]jC\\kCL_AxA@BAN?H?B?D??G?O?I?CJATMvDBt@@F?p@Lj@@FCHI@O?W?_DBqBHuBHoABq@BUFoAFc@@Y?A?I@MBa@Bs@Bg@@w@@uAAYEqBKgBLK@CIq@?UGc@Ii@G]Kk@Ke@Ic@ASK[AG??DCGSCIGISc@Ye@SUBUHm@@S?Q?O?U?UESAERQHGBCCEKS?A?A??TGrCs@z@O~@M|BWvC[VC?@JVVh@FIPIPGDAFA@V@\\BP@PFR`@v@jIzNjDfGJNhFzI|H`NFLf@r@DTPVR^\\j@Vb@nC|EzA~C`BhE~ArFfAtEb@|Bj@jDZ|BLdAHHL?|Ce@r@OP@ELQRBHCd@OBYDDh@N|BBZHVHNJVCD_@t@Uh@WjAERAJCLEXMvAA\\?x@?B@pAChDGzCM~COfCMxAAHAJCZQ`BSfBAHCNYpBUvAw@~DCHCLQx@Y~AmAjGi@hCYxAMp@q@fD]dBEVI\\[~A]`BALSGQjAa@vBSdACNENGVEHs@DGPc@lAMPKbAoAnLwAbMaAbJg@fFmAtGcA~DwAjEg@fAiC|E}BlDcBjBmAhAkAvA{@nA_@j@gA`BYXoDbFaBzCiApCeBvF}@nE_A`Gg@hHAfHBpDNnDVxC\\|A~@nCZb@',
  },
];
