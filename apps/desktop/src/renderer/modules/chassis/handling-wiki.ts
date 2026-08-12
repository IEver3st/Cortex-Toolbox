import { HANDLING_FIELDS, type HandlingValues } from '@cortex/vehicle-meta';

export type HandlingWikiCategory =
  'physical' | 'powertrain' | 'braking' | 'traction' | 'suspension' | 'damage' | 'advanced';

export interface HandlingWikiExample {
  symptom: string;
  adjustment: string;
  outcome: string;
}

export interface HandlingWikiArticle {
  id: string;
  label: string;
  technicalName: string;
  category: HandlingWikiCategory;
  summary: string;
  increaseEffect: string;
  decreaseEffect: string;
  watchFor: string;
  examples: HandlingWikiExample[];
  related: string[];
  searchTerms: string[];
}

interface FieldGuidance {
  increaseEffect: string;
  decreaseEffect: string;
  watchFor: string;
  examples: HandlingWikiExample[];
  related?: string[];
  searchTerms?: string[];
}

const example = (symptom: string, adjustment: string, outcome: string): HandlingWikiExample => ({
  symptom,
  adjustment,
  outcome,
});

const FIELD_GUIDANCE: Record<keyof HandlingValues, FieldGuidance> = {
  fMass: {
    increaseEffect:
      'Adds inertia and collision authority, but asks more of the engine, brakes, and springs.',
    decreaseEffect:
      'Makes direction changes and acceleration easier, with less stability in impacts.',
    watchFor:
      'Changing mass alone can make an otherwise balanced tune feel underpowered or underdamped.',
    examples: [
      example(
        'The vehicle is knocked around too easily in traffic.',
        'Raise mass in small steps, then retune brake force and suspension force.',
        'More planted contact without hiding the added stopping distance.',
      ),
    ],
    related: ['fInitialDriveForce', 'fBrakeForce', 'fSuspensionForce'],
    searchTerms: ['too light', 'too heavy', 'collision', 'inertia', 'weight'],
  },
  fInitialDragCoeff: {
    increaseEffect:
      'Adds aerodynamic resistance, reducing acceleration and top speed more strongly as speed rises.',
    decreaseEffect:
      'Lets the vehicle carry speed and reach a higher terminal velocity more easily.',
    watchFor: 'Very low drag can make the listed drive velocity feel unrealistically fast.',
    examples: [
      example(
        'Acceleration feels fine but the vehicle keeps gaining too much speed.',
        'Increase aerodynamic drag before cutting drive force.',
        'High-speed growth is restrained while low-speed response stays familiar.',
      ),
    ],
    related: ['fInitialDriveMaxFlatVel', 'fInitialDriveForce', 'fDownforceModifier'],
    searchTerms: ['top speed too high', 'slow at speed', 'air resistance', 'terminal speed'],
  },
  fDownforceModifier: {
    increaseEffect: 'Adds speed-sensitive tire loading and high-speed cornering grip.',
    decreaseEffect: 'Reduces the planted aerodynamic effect and makes mechanical grip dominate.',
    watchFor:
      'Excess downforce can mask a poor traction or suspension balance and feel glued to the road.',
    examples: [
      example(
        'The vehicle is stable in slow corners but floats or washes wide at high speed.',
        'Raise downforce modestly and verify the traction balance at both speeds.',
        'More confidence in fast bends without changing parking-lot behavior much.',
      ),
    ],
    related: ['fTractionCurveMax', 'fInitialDragCoeff', 'fSuspensionForce'],
    searchTerms: ['high speed grip', 'floating', 'aero', 'glued', 'fast corners'],
  },
  fDriveBiasFront: {
    increaseEffect: 'Sends more engine torque to the front axle; 1.0 is fully front-wheel drive.',
    decreaseEffect: 'Sends more torque rearward; 0.0 is fully rear-wheel drive.',
    watchFor:
      'Torque split changes launch behavior and power-on balance, not lateral grip by itself.',
    examples: [
      example(
        'The rear tires spin hard on launch and the car will not hook up.',
        'Move drive bias toward the front or reduce drive force.',
        'More four-wheel traction and a calmer launch.',
      ),
    ],
    related: ['fInitialDriveForce', 'fTractionBiasFront', 'fLowSpeedTractionLossMult'],
    searchTerms: ['rwd', 'fwd', 'awd', 'wheelspin', 'torque split', 'launch'],
  },
  nInitialDriveGears: {
    increaseEffect:
      'Adds more forward ratios, usually keeping the engine in a narrower response band.',
    decreaseEffect: 'Uses fewer, longer ratios with more time between shifts.',
    watchFor:
      'Gear count works with maximum drive velocity; it is not a direct top-speed multiplier.',
    examples: [
      example(
        'The engine feels busy and shifts constantly during normal acceleration.',
        'Reduce the gear count or slow the upshift rate.',
        'Longer pulls with fewer interruptions.',
      ),
    ],
    related: ['fInitialDriveMaxFlatVel', 'fClutchChangeRateScaleUpShift', 'fDriveInertia'],
    searchTerms: ['too many shifts', 'transmission', 'ratios', 'gears', 'busy engine'],
  },
  fInitialDriveForce: {
    increaseEffect: 'Raises the primary acceleration torque delivered through the drivetrain.',
    decreaseEffect: 'Softens acceleration and makes traction easier to manage.',
    watchFor:
      'Too much force causes wheelspin, wheelies, or abrupt power oversteer before it creates useful speed.',
    examples: [
      example(
        'The vehicle wheelies, lifts the front wheels, or snaps sideways under throttle.',
        'Lower drive force, then check centre of mass height and rear suspension travel.',
        'A harder usable launch with less pitch and wheelspin.',
      ),
    ],
    related: ['fDriveBiasFront', 'fLowSpeedTractionLossMult', 'centreOfMass'],
    searchTerms: [
      'wheelie',
      'front lifts',
      'acceleration',
      'wheelspin',
      'too much power',
      'slow launch',
    ],
  },
  fDriveInertia: {
    increaseEffect: 'Makes engine speed react more quickly to throttle and load changes.',
    decreaseEffect: 'Smooths and slows engine response.',
    watchFor:
      'High inertia can feel nervous and amplify abrupt shifting even when drive force is reasonable.',
    examples: [
      example(
        'Throttle response is delayed even though acceleration strength is adequate.',
        'Raise drive inertia slightly without changing drive force.',
        'Quicker engine response with the same broad acceleration target.',
      ),
    ],
    related: ['fInitialDriveForce', 'fClutchChangeRateScaleUpShift'],
    searchTerms: ['throttle lag', 'rev response', 'nervous engine', 'engine response'],
  },
  fClutchChangeRateScaleUpShift: {
    increaseEffect: 'Engages the next higher gear faster and shortens the power interruption.',
    decreaseEffect: 'Produces slower, softer upshifts.',
    watchFor:
      'Extremely fast engagement can make shifts feel harsh or destabilize a high-power car.',
    examples: [
      example(
        'The vehicle loses too much momentum every time it shifts up.',
        'Increase the upshift rate in small steps.',
        'Shorter shift pauses and stronger continuous acceleration.',
      ),
    ],
    related: ['fClutchChangeRateScaleDownShift', 'nInitialDriveGears', 'fDriveInertia'],
    searchTerms: ['slow shift', 'upshift', 'gear change', 'loses momentum'],
  },
  fClutchChangeRateScaleDownShift: {
    increaseEffect: 'Engages lower gears faster during braking or renewed acceleration.',
    decreaseEffect: 'Makes downshifts slower and more progressive.',
    watchFor: 'Aggressive downshifts can upset rear traction on corner entry.',
    examples: [
      example(
        'The car hesitates before accelerating after braking for a corner.',
        'Raise the downshift rate slightly.',
        'The correct gear arrives sooner when throttle returns.',
      ),
    ],
    related: ['fClutchChangeRateScaleUpShift', 'fBrakeBiasFront', 'fTractionCurveMin'],
    searchTerms: ['downshift lag', 'corner entry', 'hesitates after braking', 'gear change'],
  },
  fInitialDriveMaxFlatVel: {
    increaseEffect: 'Raises the transmission speed target and lengthens the overall gearing.',
    decreaseEffect: 'Shortens the speed target, usually trading terminal speed for usable pull.',
    watchFor:
      'Actual top speed also depends on drive force and drag; this value alone does not guarantee it.',
    examples: [
      example(
        'The car reaches the limiter too early while still pulling strongly.',
        'Raise max flat velocity, then test whether drive force can overcome drag.',
        'More headroom without blindly adding power.',
      ),
    ],
    related: ['fInitialDragCoeff', 'fInitialDriveForce', 'nInitialDriveGears'],
    searchTerms: ['top speed', 'speed limiter', 'gearing too short', 'will not reach speed'],
  },
  fBrakeForce: {
    increaseEffect:
      'Raises total service-brake torque and shortens stopping distance until tires lose grip.',
    decreaseEffect: 'Softens braking and lengthens the stop.',
    watchFor: 'More brake force cannot fix a poor brake bias and may only create lockup.',
    examples: [
      example(
        'The brakes feel weak even though the vehicle stays straight.',
        'Increase brake force, then verify neither axle locks first.',
        'Shorter, controlled stops.',
      ),
    ],
    related: ['fBrakeBiasFront', 'fTractionCurveMax', 'fMass'],
    searchTerms: ['brakes weak', 'stopping distance', 'lockup', 'will not stop'],
  },
  fBrakeBiasFront: {
    increaseEffect:
      'Moves more service-brake force to the front axle, generally increasing entry stability.',
    decreaseEffect: 'Moves braking rearward, which can help rotation but risks rear lockup.',
    watchFor:
      'Too much front bias causes understeer or front lock; too little can spin the vehicle under braking.',
    examples: [
      example(
        'The rear swings around when braking into a corner.',
        'Increase front brake bias a few points.',
        'A straighter, more predictable corner entry.',
      ),
    ],
    related: ['fBrakeForce', 'fTractionBiasFront', 'centreOfMass'],
    searchTerms: [
      'spins under braking',
      'front lock',
      'rear lock',
      'brake balance',
      'dives forward',
    ],
  },
  fHandBrakeForce: {
    increaseEffect: 'Makes the rear handbrake lock or slow the wheels more aggressively.',
    decreaseEffect: 'Produces a softer handbrake with less abrupt rotation.',
    watchFor: 'An extreme value can make tiny inputs snap the rear around.',
    examples: [
      example(
        'The handbrake will not initiate a drift or hold the vehicle.',
        'Raise handbrake force while checking sliding traction.',
        'A decisive rear-wheel breakaway without changing normal brakes.',
      ),
    ],
    related: ['fTractionCurveMin', 'fLowSpeedTractionLossMult'],
    searchTerms: ['handbrake weak', 'drift initiation', 'rear wheels lock', 'parking brake'],
  },
  fSteeringLock: {
    increaseEffect: 'Allows a greater front-wheel angle and tighter low-speed turning.',
    decreaseEffect: 'Reduces maximum wheel angle and calms initial steering response.',
    watchFor:
      'Too much lock for the available grip creates twitchiness, scrub, or sudden over-rotation.',
    examples: [
      example(
        'The car cannot hold enough countersteer during a drift.',
        'Increase steering lock while checking lateral curve angle.',
        'More correction range without treating grip as steering angle.',
      ),
    ],
    related: ['fTractionCurveLateral', 'fTractionCurveMax'],
    searchTerms: [
      'turning circle',
      'countersteer',
      'twitchy steering',
      'will not turn',
      'steering angle',
    ],
  },
  fTractionCurveMax: {
    increaseEffect: 'Raises peak lateral tire grip before sliding begins.',
    decreaseEffect: 'Lowers the breakaway threshold and makes slides easier to start.',
    watchFor: 'The gap to sliding traction shapes how sudden the breakaway feels.',
    examples: [
      example(
        'The vehicle slides before reaching the cornering speed you expect.',
        'Raise peak traction gradually and keep a sensible gap to sliding traction.',
        'Higher cornering capacity with a readable limit.',
      ),
    ],
    related: ['fTractionCurveMin', 'fTractionCurveLateral', 'fDownforceModifier'],
    searchTerms: ['no grip', 'slides too early', 'cornering grip', 'breakaway'],
  },
  fTractionCurveMin: {
    increaseEffect: 'Retains more lateral grip after the tires begin sliding.',
    decreaseEffect: 'Makes an established slide looser and harder to recover.',
    watchFor:
      'Setting it too close to peak traction removes progressive breakaway; too far away creates a snap.',
    examples: [
      example(
        'Once the rear steps out, the car spins with no chance to catch it.',
        'Raise sliding traction or narrow its gap to peak traction.',
        'A more controllable, recoverable slide.',
      ),
    ],
    related: ['fTractionCurveMax', 'fTractionCurveLateral', 'fHandBrakeForce'],
    searchTerms: ['snap oversteer', 'spins when sliding', 'drift grip', 'cannot recover slide'],
  },
  fTractionCurveLateral: {
    increaseEffect:
      'Moves peak lateral grip to a larger slip angle, allowing more tire angle before the peak.',
    decreaseEffect: 'Makes peak grip arrive at a smaller slip angle with a sharper response.',
    watchFor: 'It changes the shape and timing of lateral response, not simply the amount of grip.',
    examples: [
      example(
        'The car feels nervous and reaches peak grip with very little steering or slip.',
        'Increase lateral curve angle slightly.',
        'A broader, more progressive response window.',
      ),
    ],
    related: ['fSteeringLock', 'fTractionCurveMax', 'fTractionCurveMin'],
    searchTerms: ['slip angle', 'nervous cornering', 'progressive grip', 'tire angle'],
  },
  fTractionSpringDeltaMax: {
    increaseEffect: 'Lets suspension displacement have a stronger influence on available traction.',
    decreaseEffect: 'Makes tire grip less sensitive to suspension movement.',
    watchFor: 'Large values can create inconsistent grip over bumps and weight transfer.',
    examples: [
      example(
        'Grip changes too abruptly as the suspension loads in a corner.',
        'Reduce traction spring delta and retest over bumps.',
        'More consistent tire behavior through suspension travel.',
      ),
    ],
    related: ['fSuspensionForce', 'fSuspensionCompDamp', 'fTractionCurveMax'],
    searchTerms: [
      'grip over bumps',
      'weight transfer',
      'inconsistent traction',
      'suspension movement',
    ],
  },
  fLowSpeedTractionLossMult: {
    increaseEffect: 'Removes more grip at low speed, encouraging burnouts and easy power slides.',
    decreaseEffect: 'Preserves low-speed launch grip and reduces wheelspin.',
    watchFor: 'High values can make starts feel like ice even when high-speed traction is good.',
    examples: [
      example(
        'The vehicle spins its tires from every stop but grips normally once moving.',
        'Lower low-speed traction loss before raising overall traction.',
        'Cleaner launches without over-gripping fast corners.',
      ),
    ],
    related: ['fInitialDriveForce', 'fDriveBiasFront', 'fTractionCurveMax'],
    searchTerms: ['burnout', 'wheelspin at launch', 'ice from stop', 'low speed grip'],
  },
  fCamberStiffnesss: {
    increaseEffect: 'Increases how strongly wheel camber influences tire response.',
    decreaseEffect:
      'Reduces camber sensitivity; zero is common when the vehicle model is not tuned for it.',
    watchFor:
      'This field is model-dependent and often best left at zero unless you can test suspension geometry.',
    examples: [
      example(
        'Grip changes strangely as the body rolls even though other traction values look sane.',
        'Return camber stiffness toward zero and compare repeatable corners.',
        'A clean baseline before adding geometry-dependent behavior.',
      ),
    ],
    related: ['fTractionSpringDeltaMax', 'fAntiRollBarForce'],
    searchTerms: ['camber', 'geometry', 'grip changes with roll', 'three s'],
  },
  fTractionBiasFront: {
    increaseEffect: 'Assigns a larger share of lateral grip to the front axle.',
    decreaseEffect: 'Moves lateral grip rearward.',
    watchFor: 'Too much front share promotes rear oversteer; too little promotes front understeer.',
    examples: [
      example(
        'The front washes wide while the rear remains planted.',
        'Increase front traction bias slightly.',
        'A more neutral cornering balance.',
      ),
    ],
    related: ['fTractionCurveMax', 'fBrakeBiasFront', 'fSuspensionBiasFront'],
    searchTerms: ['understeer', 'oversteer', 'front washes wide', 'rear steps out', 'grip balance'],
  },
  fTractionLossMult: {
    increaseEffect: 'Makes dirt, grass, and other low-grip surfaces reduce traction more strongly.',
    decreaseEffect: 'Preserves more grip away from clean pavement.',
    watchFor:
      'This is primarily a surface multiplier; do not use it as the first fix for paved-road grip.',
    examples: [
      example(
        'The off-road vehicle becomes uncontrollable the moment it touches dirt.',
        'Lower surface traction loss while leaving paved grip values intact.',
        'More usable loose-surface traction without making asphalt sticky.',
      ),
    ],
    related: ['fTractionCurveMax', 'fTractionCurveMin'],
    searchTerms: ['dirt grip', 'grass', 'off road', 'loose surface', 'slippery terrain'],
  },
  fSuspensionForce: {
    increaseEffect: 'Raises spring stiffness and resists compression, pitch, and body movement.',
    decreaseEffect: 'Creates a softer, more compliant ride with more body motion.',
    watchFor:
      'Springs need matching damping and travel; stiffness alone can make the tires skip over bumps.',
    examples: [
      example(
        'The nose dives too far under braking or the rear squats hard on launch.',
        'Increase spring force modestly, then match compression and rebound damping.',
        'Less pitch without a bouncy, overdamped ride.',
      ),
    ],
    related: ['fSuspensionCompDamp', 'fSuspensionReboundDamp', 'centreOfMass'],
    searchTerms: ['nose dive', 'rear squat', 'bottoming out', 'soft springs', 'pitching'],
  },
  fSuspensionCompDamp: {
    increaseEffect: 'Slows how quickly suspension compresses over loads and bumps.',
    decreaseEffect: 'Lets the suspension compress more freely and quickly.',
    watchFor:
      'Too much compression damping feels harsh and can make tires skip; too little allows sudden dive or bottoming.',
    examples: [
      example(
        'The suspension slams into its travel on braking or landing.',
        'Raise compression damping before simply adding more spring.',
        'More controlled compression while retaining the intended spring rate.',
      ),
    ],
    related: ['fSuspensionForce', 'fSuspensionReboundDamp', 'fSuspensionLowerLimit'],
    searchTerms: ['bottoms out', 'landing', 'compression', 'harsh bumps', 'dives quickly'],
  },
  fSuspensionReboundDamp: {
    increaseEffect: 'Slows suspension extension after it has been compressed.',
    decreaseEffect: 'Lets the wheel and body return more quickly.',
    watchFor:
      'Too little rebound causes bouncing; too much can jack the suspension down over repeated bumps.',
    examples: [
      example(
        'The car keeps bouncing after a crest, landing, or direction change.',
        'Increase rebound damping in small steps.',
        'The body settles once without oscillating.',
      ),
    ],
    related: ['fSuspensionCompDamp', 'fSuspensionForce', 'fSuspensionUpperLimit'],
    searchTerms: ['bouncy', 'oscillates', 'keeps bouncing', 'rebound', 'porpoising'],
  },
  fSuspensionUpperLimit: {
    increaseEffect: 'Allows more upward wheel travel before reaching the suspension limit.',
    decreaseEffect: 'Shortens upward travel and limits compression range.',
    watchFor:
      'Travel must make sense as a pair with the lower limit and the vehicle model geometry.',
    examples: [
      example(
        'The wheels clip or the body bottoms out on compression despite reasonable damping.',
        'Increase upper travel slightly and inspect visual clearance.',
        'More bump absorption without changing spring stiffness.',
      ),
    ],
    related: ['fSuspensionLowerLimit', 'fSuspensionRaise', 'fSuspensionCompDamp'],
    searchTerms: ['upward travel', 'compression travel', 'bottoming', 'wheel clipping'],
  },
  fSuspensionLowerLimit: {
    increaseEffect: 'Moves the downward limit closer to zero and reduces suspension droop.',
    decreaseEffect: 'Allows more downward wheel travel away from the body.',
    watchFor:
      'Excessive droop can look detached or destabilize landings; too little loses contact over crests.',
    examples: [
      example(
        'The wheels lose contact over crests and the car skips sideways.',
        'Allow slightly more lower travel and verify rebound damping.',
        'Better surface contact as the suspension extends.',
      ),
    ],
    related: ['fSuspensionUpperLimit', 'fSuspensionReboundDamp', 'fSuspensionRaise'],
    searchTerms: ['droop', 'downward travel', 'wheels lose contact', 'crest'],
  },
  fSuspensionRaise: {
    increaseEffect: 'Raises the chassis relative to the wheels.',
    decreaseEffect: 'Lowers the chassis relative to the wheels.',
    watchFor:
      'This is a geometry offset, not a replacement for spring or travel tuning; extremes can clip the model.',
    examples: [
      example(
        'The vehicle rides too high visually but spring behavior is already correct.',
        'Lower the ride-height offset in small steps.',
        'Correct visual stance without rewriting suspension dynamics.',
      ),
    ],
    related: ['fSuspensionUpperLimit', 'fSuspensionLowerLimit', 'centreOfMass'],
    searchTerms: ['ride height', 'too high', 'too low', 'stance', 'wheel clipping'],
  },
  fSuspensionBiasFront: {
    increaseEffect: 'Assigns more spring support to the front axle.',
    decreaseEffect: 'Moves spring support toward the rear axle.',
    watchFor: 'A poor spring balance can exaggerate braking dive, launch squat, or axle grip loss.',
    examples: [
      example(
        'The rear collapses under acceleration while the front barely moves.',
        'Move spring bias rearward by lowering the front share.',
        'More even support during launch.',
      ),
    ],
    related: ['fSuspensionForce', 'fTractionBiasFront', 'centreOfMass'],
    searchTerms: ['rear squat', 'front dive', 'spring balance', 'axle support'],
  },
  fAntiRollBarForce: {
    increaseEffect: 'Couples the left and right suspension more strongly and reduces body roll.',
    decreaseEffect: 'Allows more independent wheel movement and body roll.',
    watchFor: 'Too much anti-roll force can lift an inside wheel and reduce grip on uneven roads.',
    examples: [
      example(
        'The body leans excessively in corners despite acceptable ride stiffness.',
        'Raise anti-roll force rather than making every spring much stiffer.',
        'Flatter cornering with less effect on straight-line bump compliance.',
      ),
    ],
    related: ['fAntiRollBarBiasFront', 'fRollCentreHeightFront', 'fSuspensionForce'],
    searchTerms: ['body roll', 'leans in corners', 'inside wheel lifts', 'roll bar'],
  },
  fAntiRollBarBiasFront: {
    increaseEffect: 'Moves more roll resistance to the front axle, generally promoting understeer.',
    decreaseEffect: 'Moves roll resistance rearward, generally promoting rotation or oversteer.',
    watchFor:
      'Use small changes; roll balance can shift cornering behavior even when total grip is unchanged.',
    examples: [
      example(
        'The rear feels nervous in long corners while total body roll is acceptable.',
        'Move anti-roll bias slightly forward.',
        'More rear compliance and stable steady-state cornering.',
      ),
    ],
    related: ['fAntiRollBarForce', 'fTractionBiasFront', 'fSuspensionBiasFront'],
    searchTerms: ['roll oversteer', 'roll understeer', 'rear nervous', 'anti roll balance'],
  },
  fRollCentreHeightFront: {
    increaseEffect:
      'Raises the front geometric roll centre and changes how front load transfers in a corner.',
    decreaseEffect:
      'Lowers the front roll centre, generally allowing more geometric roll leverage.',
    watchFor:
      'Front and rear roll-centre heights work as a pair; large isolated changes can create jacking or odd transitions.',
    examples: [
      example(
        'The front rolls heavily before taking a set even with moderate anti-roll force.',
        'Raise the front roll centre slightly and compare against the rear value.',
        'Quicker front support without relying only on stiffer springs.',
      ),
    ],
    related: ['fRollCentreHeightRear', 'fAntiRollBarForce', 'centreOfMass'],
    searchTerms: ['front roll centre', 'jacking', 'front body roll', 'load transfer'],
  },
  fRollCentreHeightRear: {
    increaseEffect:
      'Raises the rear geometric roll centre and makes rear load transfer react more directly.',
    decreaseEffect: 'Lowers the rear roll centre and adds geometric roll leverage.',
    watchFor:
      'An excessively high rear relative to front can make the vehicle rotate abruptly or lift a wheel.',
    examples: [
      example(
        'The rear snaps into rotation as soon as the vehicle takes a cornering set.',
        'Lower the rear roll centre or bring it closer to the front value.',
        'A more progressive transition into steady-state cornering.',
      ),
    ],
    related: ['fRollCentreHeightFront', 'fAntiRollBarBiasFront', 'centreOfMass'],
    searchTerms: ['rear roll centre', 'snap rotation', 'jacking', 'inside wheel'],
  },
  fCollisionDamageMult: {
    increaseEffect: 'Makes impacts remove more vehicle health.',
    decreaseEffect: 'Makes the vehicle more resistant to collision damage.',
    watchFor: 'This affects received damage, not visual deformation alone.',
    examples: [
      example(
        'Minor traffic contact destroys the vehicle too quickly.',
        'Lower collision damage multiplier.',
        'More durability in impacts without changing weapon damage.',
      ),
    ],
    related: ['fDeformationDamageMult', 'fEngineDamageMult'],
    searchTerms: ['crashes destroy car', 'impact damage', 'too fragile', 'durability'],
  },
  fWeaponDamageMult: {
    increaseEffect: 'Makes bullets and weapon hits deal more vehicle damage.',
    decreaseEffect: 'Makes the vehicle more resistant to weapon damage.',
    watchFor:
      'Very low values can undermine gameplay balance even when collision durability is reasonable.',
    examples: [
      example(
        'The armored vehicle is disabled by only a few ordinary shots.',
        'Lower weapon damage multiplier independently of collision damage.',
        'Weapon resistance that does not make crashes harmless.',
      ),
    ],
    related: ['fCollisionDamageMult', 'fEngineDamageMult'],
    searchTerms: ['bullets', 'gunfire', 'armored', 'weapon resistance', 'shots destroy car'],
  },
  fDeformationDamageMult: {
    increaseEffect: 'Makes the body visually and physically deform more from damage.',
    decreaseEffect: 'Keeps panels and body shape more rigid.',
    watchFor:
      'Deformation and health loss are related but separate; tune both when damage feels wrong.',
    examples: [
      example(
        'The body crumples unrealistically from small bumps but health is acceptable.',
        'Lower deformation damage multiplier.',
        'Less visible crushing without changing general impact health loss.',
      ),
    ],
    related: ['fCollisionDamageMult', 'fEngineDamageMult'],
    searchTerms: ['crumples', 'dents too much', 'body damage', 'visual deformation'],
  },
  fEngineDamageMult: {
    increaseEffect: 'Makes the engine lose health faster when the vehicle takes damage.',
    decreaseEffect: 'Protects engine health and delays mechanical failure.',
    watchFor:
      'A durable body with a high engine multiplier can still fail suddenly after moderate hits.',
    examples: [
      example(
        'The vehicle looks intact but the engine dies after a small collision.',
        'Lower engine damage multiplier and compare with collision damage.',
        'Mechanical durability that matches the visible condition.',
      ),
    ],
    related: ['fCollisionDamageMult', 'fDeformationDamageMult'],
    searchTerms: ['engine dies', 'mechanical failure', 'engine health', 'stalls after crash'],
  },
  fPetrolTankVolume: {
    increaseEffect: 'Stores a larger fuel-capacity value for scripts that read handling data.',
    decreaseEffect: 'Stores a smaller fuel capacity.',
    watchFor:
      'GTA does not provide a universal fuel-consumption simulation; the active FiveM fuel resource decides how this value is used.',
    examples: [
      example(
        'A fuel script gives this heavy vehicle the range of a small motorcycle.',
        'Raise tank volume to a vehicle-appropriate capacity and verify the script reads it.',
        'More credible range when the server resource supports the field.',
      ),
    ],
    related: ['fOilVolume'],
    searchTerms: ['fuel capacity', 'tank size', 'fuel script', 'range'],
  },
  fOilVolume: {
    increaseEffect: 'Stores a larger oil-capacity value for scripts that consume it.',
    decreaseEffect: 'Stores a smaller oil capacity.',
    watchFor:
      'Many servers do not use this field; confirm the maintenance or engine script actually reads it.',
    examples: [
      example(
        'A maintenance script reports the wrong oil capacity for the vehicle.',
        'Set oil volume to the intended capacity after confirming integration support.',
        'Correct script metadata without changing engine damage behavior.',
      ),
    ],
    related: ['fPetrolTankVolume', 'fEngineDamageMult'],
    searchTerms: ['oil capacity', 'maintenance script', 'engine oil'],
  },
};

const ADDITIONAL_FIELD_EXAMPLES: Record<
  keyof HandlingValues,
  [HandlingWikiExample, HandlingWikiExample]
> = {
  fMass: [
    example(
      'Acceleration, braking, and direction changes all became sluggish after making the vehicle heavier.',
      'Return mass toward the real vehicle weight before compensating with extreme power or brake values.',
      'A believable weight baseline that the rest of the tune can support.',
    ),
    example(
      'The vehicle changes direction unrealistically fast and gets thrown around during contact.',
      'Increase mass gradually, then check that the springs and brakes still control it.',
      'More convincing inertia without creating a slow, underdamped chassis.',
    ),
  ],
  fInitialDragCoeff: [
    example(
      'The vehicle stops accelerating at high speed even though gearing and power should allow more.',
      'Reduce aerodynamic drag slightly and retest the same straight.',
      'Less high-speed resistance without changing low-speed launch force.',
    ),
    example(
      'The vehicle coasts forever and barely loses speed after lifting off the throttle.',
      'Increase drag modestly instead of shortening every gear.',
      'More natural speed bleed and a controlled terminal velocity.',
    ),
  ],
  fDownforceModifier: [
    example(
      'The rear feels light in fast bends but balanced in slow corners.',
      'Increase downforce before moving the static traction bias.',
      'High-speed stability that preserves the low-speed balance.',
    ),
    example(
      'The car feels glued down at speed and will not rotate even when the mechanical tune is neutral.',
      'Reduce downforce and recheck peak traction at several speeds.',
      'A more natural increase in grip as speed builds.',
    ),
  ],
  fDriveBiasFront: [
    example(
      'The front tires spin and the vehicle pushes wide whenever power is applied in a corner.',
      'Move drive bias rearward and confirm the rear tires can accept the added torque.',
      'Less power understeer and a more neutral corner exit.',
    ),
    example(
      'The rear snaps loose on corner exit even with reasonable overall traction.',
      'Move a small amount of drive bias forward.',
      'More stable power delivery without reducing lateral grip everywhere.',
    ),
  ],
  nInitialDriveGears: [
    example(
      'Engine speed drops too far after each shift and the vehicle falls out of its useful response range.',
      'Add a forward gear or lower the maximum drive velocity.',
      'Closer ratios that keep acceleration consistent.',
    ),
    example(
      'A utility vehicle has short, frantic ratios that do not match its character.',
      'Reduce the gear count and verify the remaining ratios can reach the intended speed.',
      'Longer, calmer pulls with fewer unnecessary changes.',
    ),
  ],
  fInitialDriveForce: [
    example(
      'The vehicle launches cleanly but feels too slow everywhere in the rev range.',
      'Increase drive force in small steps while watching low-speed wheelspin.',
      'Stronger acceleration that the tires can still use.',
    ),
    example(
      'The car loses speed badly on hills despite sensible gearing and drag.',
      'Raise drive force slightly rather than inflating the maximum velocity target.',
      'Enough sustained pull to maintain speed under load.',
    ),
  ],
  fDriveInertia: [
    example(
      'Tiny throttle inputs make engine response surge and fall too abruptly.',
      'Lower drive inertia without reducing the available drive force.',
      'Smoother throttle modulation with unchanged peak acceleration.',
    ),
    example(
      'The engine takes too long to recover after a gear change.',
      'Increase drive inertia slightly and compare shift behavior.',
      'Faster response as the next gear engages.',
    ),
  ],
  fClutchChangeRateScaleUpShift: [
    example(
      'Every upshift breaks rear traction and jerks the chassis sideways.',
      'Lower the upshift rate until engagement becomes progressive.',
      'Fast shifts that no longer shock the driven tires.',
    ),
    example(
      'A performance gearbox changes gear too softly even though the ratio spacing is correct.',
      'Increase upshift rate without adding drive force.',
      'A sharper shift response without extra engine output.',
    ),
  ],
  fClutchChangeRateScaleDownShift: [
    example(
      'Downshifts unsettle the rear axle and start a spin during braking.',
      'Reduce downshift rate and check rear tire grip.',
      'Smoother engine-braking transitions on corner entry.',
    ),
    example(
      'Kickdown feels lazy when accelerating out of a slow corner.',
      'Increase downshift rate a little at a time.',
      'A prompt lower gear without an abrupt traction break.',
    ),
  ],
  fInitialDriveMaxFlatVel: [
    example(
      'The maximum velocity target is so tall that every ratio feels long and acceleration is weak.',
      'Lower max flat velocity to match the intended real top speed.',
      'More useful gearing without adding artificial torque.',
    ),
    example(
      'The vehicle reaches its speed target early but still has enough power to accelerate.',
      'Increase max flat velocity and confirm drag remains realistic.',
      'Additional speed headroom with the same launch behavior.',
    ),
  ],
  fBrakeForce: [
    example(
      'The tires lock from a light brake input even though front-to-rear balance feels correct.',
      'Reduce brake force until pedal response becomes progressive.',
      'Usable braking range instead of an instant lockup.',
    ),
    example(
      'A heavier vehicle needs an unrealistic distance to stop after its mass was corrected.',
      'Increase brake force, then retest axle lockup and brake bias.',
      'Stopping performance appropriate for the new mass.',
    ),
  ],
  fBrakeBiasFront: [
    example(
      'The front tires lock first and the vehicle plows straight on under braking.',
      'Move brake bias slightly rearward.',
      'More shared braking work and less braking understeer.',
    ),
    example(
      'The vehicle refuses to rotate into a corner while trail braking.',
      'Reduce front brake bias carefully while monitoring rear stability.',
      'A small amount of controllable entry rotation.',
    ),
  ],
  fHandBrakeForce: [
    example(
      'A brief handbrake tap spins the vehicle beyond recovery.',
      'Reduce handbrake force and check the gap between peak and sliding traction.',
      'A progressive drift initiation instead of an instant spin.',
    ),
    example(
      'The handbrake slows the car but never breaks rear traction.',
      'Increase handbrake force in small steps.',
      'A decisive rear lock when deliberately requested.',
    ),
  ],
  fSteeringLock: [
    example(
      'The vehicle is twitchy at speed and reaches excessive wheel angle from small corrections.',
      'Reduce steering lock and verify the lateral traction curve still feels progressive.',
      'Calmer high-speed corrections without reducing tire grip.',
    ),
    example(
      'The turning circle is too wide in parking lots and tight switchbacks.',
      'Increase steering lock modestly.',
      'Tighter low-speed maneuvering without extreme scrub.',
    ),
  ],
  fTractionCurveMax: [
    example(
      'The vehicle grips so hard that it tips onto two wheels instead of sliding.',
      'Lower peak traction and inspect centre of mass height.',
      'A progressive tire limit before rollover forces dominate.',
    ),
    example(
      'There is not enough cornering grip even before the tires begin to slide.',
      'Increase peak traction while preserving a gap to sliding traction.',
      'More cornering capacity with a clear breakaway point.',
    ),
  ],
  fTractionCurveMin: [
    example(
      'A drift will not rotate because the tires remain almost as grippy while sliding as at the peak.',
      'Lower sliding traction slightly.',
      'A usable slide angle with an intentional loss of grip.',
    ),
    example(
      'The vehicle stays sideways but cannot recover once steering is straightened.',
      'Increase sliding traction without exceeding peak traction.',
      'Enough retained grip to catch and exit the slide.',
    ),
  ],
  fTractionCurveLateral: [
    example(
      'The vehicle needs excessive steering angle before the tires feel fully loaded.',
      'Reduce lateral curve angle slightly.',
      'Peak response arrives earlier in the steering movement.',
    ),
    example(
      'A drift car snaps to peak lateral force before there is enough slip angle to control it.',
      'Increase lateral curve angle and verify steering lock.',
      'A wider, more readable drift response window.',
    ),
  ],
  fTractionSpringDeltaMax: [
    example(
      'Traction barely reacts to weight transfer and the car feels disconnected from suspension loading.',
      'Increase traction spring delta conservatively.',
      'More tire response as the suspension takes a set.',
    ),
    example(
      'One bump causes a sudden grip spike followed by a slide.',
      'Reduce traction spring delta and retune damping if needed.',
      'Consistent traction through changing suspension position.',
    ),
  ],
  fLowSpeedTractionLossMult: [
    example(
      'A drift setup refuses to spin the rear tires at low speed.',
      'Increase low-speed traction loss before reducing grip at every speed.',
      'Easier burnout and drift initiation with normal fast-corner grip.',
    ),
    example(
      'An AWD vehicle feels slippery only during parking-lot acceleration.',
      'Reduce low-speed traction loss and retest the launch.',
      'Predictable low-speed grip without changing the torque split.',
    ),
  ],
  fCamberStiffnesss: [
    example(
      'The inside tires gain or lose grip unpredictably as the body leans.',
      'Reduce camber stiffness toward zero and compare the same corner.',
      'A stable baseline independent of questionable model geometry.',
    ),
    example(
      'A model with verified camber animation shows no grip response to wheel angle.',
      'Increase camber stiffness in very small steps.',
      'A measurable geometry response without overwhelming the base traction curve.',
    ),
  ],
  fTractionBiasFront: [
    example(
      'The rear steps out before the front reaches its limit in steady corners.',
      'Move traction bias rearward by lowering the front share.',
      'More rear lateral capacity and less steady-state oversteer.',
    ),
    example(
      'The car has too much understeer and the front slides while the rear stays planted.',
      'Increase front traction bias slightly, then check suspension and anti-roll balance.',
      'A more neutral axle grip balance instead of simply adding grip everywhere.',
    ),
  ],
  fTractionLossMult: [
    example(
      'An off-road vehicle has nearly pavement-level grip on dirt and grass.',
      'Increase surface traction loss until loose terrain matters.',
      'Distinct surface behavior without weakening asphalt traction.',
    ),
    example(
      'Touching a road shoulder causes an immediate, unrecoverable spin.',
      'Reduce surface traction loss and keep sliding traction consistent.',
      'A recoverable transition between pavement and loose ground.',
    ),
  ],
  fSuspensionForce: [
    example(
      'The suspension is not leaning into corners and the chassis skips across uneven pavement.',
      'Reduce spring force and verify anti-roll force is not also excessive.',
      'Natural body movement with better tire contact over bumps.',
    ),
    example(
      'The vehicle leans too far in corners and takes too long to settle.',
      'Increase spring force modestly, then match the rebound damping.',
      'Controlled body lean without turning the suspension rigid.',
    ),
  ],
  fSuspensionCompDamp: [
    example(
      'Sharp bumps feel harsh and the tires skip instead of moving upward.',
      'Reduce compression damping while keeping enough travel to avoid bottoming.',
      'Faster bump absorption and steadier tire contact.',
    ),
    example(
      'The nose collapses immediately when braking even though spring force is reasonable.',
      'Increase compression damping slightly at the affected end through the suspension balance.',
      'Slower, controlled weight transfer rather than a sudden dive.',
    ),
  ],
  fSuspensionReboundDamp: [
    example(
      'The suspension stays compressed over repeated bumps and loses available travel.',
      'Reduce rebound damping so the wheels can extend between impacts.',
      'Recovered ride height and consistent travel over rough roads.',
    ),
    example(
      'The body rises too quickly after braking and oscillates through the next corner.',
      'Increase rebound damping in small steps.',
      'One controlled return to the settled position.',
    ),
  ],
  fSuspensionUpperLimit: [
    example(
      'The wheel travels too far into the body and clips through the arch.',
      'Reduce upper travel or raise the chassis slightly if the model clearance is wrong.',
      'Compression travel that remains inside the visible geometry.',
    ),
    example(
      'The suspension hits its upper stop on ordinary bumps despite sensible damping.',
      'Increase upper travel slightly and inspect model clearance.',
      'More usable compression range before the hard stop.',
    ),
  ],
  fSuspensionLowerLimit: [
    example(
      'The wheels hang unrealistically far below the body when airborne.',
      'Move the lower limit closer to zero.',
      'Realistic droop without changing ride height on the ground.',
    ),
    example(
      'The vehicle loses tire contact over crests because the wheels cannot extend far enough.',
      'Allow more negative lower travel and check rebound damping.',
      'Better surface following as the chassis unloads.',
    ),
  ],
  fSuspensionRaise: [
    example(
      'The body scrapes the ground even though spring stiffness and travel are correct.',
      'Increase the ride-height offset slightly.',
      'Added ground clearance without making the springs artificially stiff.',
    ),
    example(
      'The chassis sits too tall and leaves an unrealistic wheel gap.',
      'Reduce ride-height offset while checking compression clearance.',
      'A lower visual stance that still has usable travel.',
    ),
  ],
  fSuspensionBiasFront: [
    example(
      'The front suspension barely leans into corners and the vehicle has too much understeer.',
      'Move spring bias rearward by reducing the front share, then check front anti-roll bias.',
      'More front compliance and a more neutral cornering attitude.',
    ),
    example(
      'The front dives deeply under braking while the rear remains almost static.',
      'Increase front spring bias slightly if the front axle lacks support.',
      'Better front support without stiffening both axles.',
    ),
  ],
  fAntiRollBarForce: [
    example(
      'The suspension does not lean into corners and opposite-side bumps upset the whole vehicle.',
      'Reduce anti-roll force so the left and right wheels can move more independently.',
      'Useful body lean and better compliance on uneven roads.',
    ),
    example(
      'The vehicle rolls excessively even though its straight-line ride is already firm enough.',
      'Increase anti-roll force instead of stiffening every spring.',
      'Flatter cornering while retaining bump compliance.',
    ),
  ],
  fAntiRollBarBiasFront: [
    example(
      'The vehicle has too much understeer after body roll was reduced.',
      'Move anti-roll bias rearward by lowering the front share.',
      'More front axle compliance and improved rotation.',
    ),
    example(
      'The rear lifts or snaps loose when loaded through a long corner.',
      'Move anti-roll bias forward slightly.',
      'More rear independence and a calmer cornering balance.',
    ),
  ],
  fRollCentreHeightFront: [
    example(
      'The front jacks upward, lifts an inside wheel, or pushes wide as corner load builds.',
      'Lower the front roll centre and compare it with the rear height.',
      'More progressive front load transfer and less geometric understeer.',
    ),
    example(
      'The front takes too long to support the body before turning into a corner.',
      'Raise the front roll centre slightly rather than adding excessive spring force.',
      'Quicker front response with retained suspension movement.',
    ),
  ],
  fRollCentreHeightRear: [
    example(
      'The vehicle refuses to rotate and feels dominated by front-end understeer.',
      'Raise the rear roll centre slightly while watching for abrupt breakaway.',
      'More responsive rear load transfer and improved rotation.',
    ),
    example(
      'The rear lifts an inside wheel and snaps around midway through the corner.',
      'Lower the rear roll centre toward the front value.',
      'A smoother rear transition with less jacking.',
    ),
  ],
  fCollisionDamageMult: [
    example(
      'Major crashes barely reduce vehicle health and have no gameplay consequence.',
      'Increase collision damage multiplier.',
      'Impact damage that matches the severity of the crash.',
    ),
    example(
      'A work vehicle needs durability in traffic but should remain vulnerable to weapons.',
      'Lower collision damage only and leave weapon damage at its intended value.',
      'Targeted crash resistance without universal invulnerability.',
    ),
  ],
  fWeaponDamageMult: [
    example(
      'An ordinary vehicle behaves like a bullet sponge.',
      'Increase weapon damage multiplier while leaving collision durability unchanged.',
      'Weapon vulnerability appropriate to the vehicle class.',
    ),
    example(
      'An armored vehicle survives crashes correctly but fails too quickly under gunfire.',
      'Lower weapon damage multiplier only.',
      'Armor-specific protection without making collisions harmless.',
    ),
  ],
  fDeformationDamageMult: [
    example(
      'Severe crashes leave the body almost perfectly undamaged.',
      'Increase deformation damage multiplier while monitoring health damage separately.',
      'Visible crash damage that communicates impact severity.',
    ),
    example(
      'Small parking impacts fold panels and distort the chassis.',
      'Reduce deformation multiplier.',
      'Proportional visual damage from minor contact.',
    ),
  ],
  fEngineDamageMult: [
    example(
      'The engine never develops mechanical trouble even after repeated heavy crashes.',
      'Increase engine damage multiplier without changing visual deformation.',
      'Mechanical failure that reflects accumulated abuse.',
    ),
    example(
      'The engine stalls after light contact while the rest of the vehicle is healthy.',
      'Reduce engine damage multiplier.',
      'Engine durability aligned with overall vehicle condition.',
    ),
  ],
  fPetrolTankVolume: [
    example(
      'A compact vehicle travels unrealistically far because its configured tank is oversized.',
      'Lower tank volume and verify the fuel resource uses handling metadata.',
      'Range appropriate to the vehicle when the integration is active.',
    ),
    example(
      'A heavy utility vehicle runs out of fuel after only a short route.',
      'Increase tank volume before changing the server-wide consumption rate.',
      'Vehicle-specific range without affecting every other vehicle.',
    ),
  ],
  fOilVolume: [
    example(
      'An integrated maintenance script drains the oil percentage too quickly for this engine.',
      'Increase oil volume after confirming the script derives capacity from handling data.',
      'A slower, capacity-appropriate oil depletion rate.',
    ),
    example(
      'A small engine reports an implausibly large oil fill quantity.',
      'Lower oil volume to the intended capacity.',
      'Maintenance data that matches the vehicle specification.',
    ),
  ],
};

const FIELD_CATEGORY: Record<string, HandlingWikiCategory> = {
  mass: 'physical',
  powertrain: 'powertrain',
  brakes: 'braking',
  grip: 'traction',
  suspension: 'suspension',
  damage: 'damage',
};

const scalarArticles = HANDLING_FIELDS.map<HandlingWikiArticle>((field) => {
  const guidance = FIELD_GUIDANCE[field.key];
  return {
    id: field.key,
    label: field.label,
    technicalName: field.key,
    category: FIELD_CATEGORY[field.category] ?? 'advanced',
    summary: field.description,
    increaseEffect: guidance.increaseEffect,
    decreaseEffect: guidance.decreaseEffect,
    watchFor: guidance.watchFor,
    examples: [...guidance.examples, ...ADDITIONAL_FIELD_EXAMPLES[field.key]],
    related: guidance.related ?? [],
    searchTerms: guidance.searchTerms ?? [],
  };
});

const setupArticles: HandlingWikiArticle[] = [
  {
    id: 'centreOfMass',
    label: 'Centre of mass',
    technicalName: 'vecCentreOfMassOffset',
    category: 'physical',
    summary:
      'Moves the simulated weight centre without moving the visible model. X is left/right, Y is rear/front, and Z is lower/higher.',
    increaseEffect:
      'Positive X moves weight right, positive Y moves it forward, and positive Z raises it. Raising Z adds roll and pitch leverage.',
    decreaseEffect:
      'Negative X moves weight left, negative Y moves it rearward, and negative Z lowers it for more resistance to roll and wheelies.',
    watchFor:
      'Use small offsets. Large changes can hide a bad suspension tune, cause two-wheel cornering, or create implausible launch behavior.',
    examples: [
      example(
        'The vehicle pitches too far forward under braking or dives heavily onto the front axle.',
        'Move centre of mass slightly rearward on Y or lower Z, then verify brake and spring balance.',
        'Less forward pitch without removing all weight transfer.',
      ),
      example(
        'The vehicle wheelies or lifts its front wheels under acceleration.',
        'Move centre of mass forward on Y, lower Z, and inspect drive force and rear suspension squat.',
        'A planted launch with controlled pitch instead of an artificial wheelie.',
      ),
      example(
        'The vehicle tips onto two wheels instead of leaning or sliding through a corner.',
        'Lower centre of mass on Z and confirm peak traction is not excessive.',
        'Progressive body roll and tire breakaway before rollover.',
      ),
    ],
    related: ['fInitialDriveForce', 'fSuspensionForce', 'fBrakeBiasFront', 'inertiaMultiplier'],
    searchTerms: [
      'wheelie',
      'pitching too far forward',
      'front lifts',
      'nose dive',
      'rollover',
      'weight centre',
      'balance point',
    ],
  },
  {
    id: 'inertiaMultiplier',
    label: 'Inertia multiplier',
    technicalName: 'vecInertiaMultiplier',
    category: 'physical',
    summary:
      'Controls resistance to rotational acceleration. X primarily affects pitch, Y roll, and Z yaw response.',
    increaseEffect:
      'More multiplier on an axis makes the body resist beginning and ending rotation around that axis.',
    decreaseEffect:
      'Less multiplier makes rotation start and reverse more quickly, which can feel agile or unstable.',
    watchFor:
      'Inertia changes response, not the static balance point. Fix centre of mass and axle biases before using it to mask a persistent lean.',
    examples: [
      example(
        'The vehicle rocks forward and backward too quickly after landing or braking.',
        'Increase pitch-axis inertia (X) modestly and verify rebound damping.',
        'Slower, more believable pitch response without freezing suspension travel.',
      ),
      example(
        'The car spins into yaw too abruptly during small steering corrections.',
        'Increase yaw-axis inertia (Z) slightly.',
        'More progressive rotation and easier recovery.',
      ),
      example(
        'The chassis barely reacts to weight transfer and feels unnaturally resistant to rotation.',
        'Reduce the affected pitch, roll, or yaw inertia axis in small steps.',
        'Visible, controllable rotation without making the body twitchy.',
      ),
    ],
    related: ['centreOfMass', 'fSuspensionReboundDamp', 'fSteeringLock'],
    searchTerms: ['pitch', 'roll', 'yaw', 'rotation', 'twitchy', 'rocks forward', 'spins too fast'],
  },
  {
    id: 'seatOffset',
    label: 'Seat offset',
    technicalName: 'vecSeatOffset',
    category: 'advanced',
    summary:
      'Offsets the occupant seating position on X, Y, and Z without changing vehicle physics.',
    increaseEffect:
      'Moves the seated position right, forward, or upward on the corresponding axis.',
    decreaseEffect:
      'Moves the seated position left, rearward, or downward on the corresponding axis.',
    watchFor:
      'This corrects visual alignment only. Large values can cause clipping or poor entry animations.',
    examples: [
      example(
        'The driver clips through the roof even though handling behavior is correct.',
        'Lower the seat Z offset in small steps.',
        'A visually aligned driver position with unchanged vehicle dynamics.',
      ),
      example(
        'The driver sits too far forward and clips through the steering wheel or dashboard.',
        'Move seat Y rearward until the hands and torso align.',
        'Correct fore-aft placement without changing centre of mass.',
      ),
      example(
        'The occupant is visibly off-centre from the seat.',
        'Adjust seat X left or right in small increments.',
        'A centred occupant with clean door and entry alignment.',
      ),
    ],
    related: [],
    searchTerms: ['driver position', 'seat clipping', 'occupant', 'ped position'],
  },
];

export const HANDLING_WIKI_ARTICLES: HandlingWikiArticle[] = [...setupArticles, ...scalarArticles];

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'causing',
  'does',
  'far',
  'for',
  'from',
  'have',
  'how',
  'i',
  'is',
  'it',
  'into',
  'much',
  'not',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'too',
  'vehicle',
  'what',
  'when',
  'with',
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();
}

function searchableText(article: HandlingWikiArticle): string {
  return normalize(
    [
      article.label,
      article.technicalName,
      article.summary,
      article.increaseEffect,
      article.decreaseEffect,
      article.watchFor,
      ...article.searchTerms,
      ...article.examples.flatMap((item) => [item.symptom, item.adjustment, item.outcome]),
    ].join(' '),
  );
}

export function searchHandlingWiki(query: string): HandlingWikiArticle[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return HANDLING_WIKI_ARTICLES;
  const tokens = normalizedQuery
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  const minimumScore = tokens.length >= 3 ? 18 : 1;

  return HANDLING_WIKI_ARTICLES.map((article) => {
    const label = normalize(article.label);
    const technicalName = normalize(article.technicalName);
    const haystack = searchableText(article);
    let score = haystack.includes(normalizedQuery) ? 120 : 0;
    if (label.includes(normalizedQuery) || technicalName.includes(normalizedQuery)) score += 180;
    for (const token of tokens) {
      if (!haystack.includes(token)) continue;
      score += 8;
      if (label.includes(token)) score += 16;
      if (technicalName.includes(token)) score += 12;
      if (article.searchTerms.some((term) => normalize(term).includes(token))) score += 10;
    }
    return { article, score };
  })
    .filter((result) => result.score >= minimumScore)
    .sort(
      (left, right) =>
        right.score - left.score || left.article.label.localeCompare(right.article.label),
    )
    .map((result) => result.article);
}

export function handlingWikiArticle(id: string): HandlingWikiArticle | undefined {
  return HANDLING_WIKI_ARTICLES.find((article) => article.id === id);
}
