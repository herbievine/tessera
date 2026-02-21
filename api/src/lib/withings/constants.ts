export const measurementsMapping = {
	1: {
		name: "Weight (kg)",
		key: "weight",
		unit: "kg",
	},
	4: {
		name: "Height (meter)",
		key: "height",
		unit: "m",
	},
	5: {
		name: "Fat Free Mass (kg)",
		key: "fat_free_mass",
		unit: "kg",
	},
	6: {
		name: "Fat Ratio (%)",
		key: "fat_ratio_pct",
		unit: "%",
	},
	8: {
		name: "Fat Mass Weight (kg)",
		key: "fat_mass_weight",
		unit: "kg",
	},
	9: {
		name: "Diastolic Blood Pressure (mmHg)",
		key: "diastolic_bp",
		unit: "mmHg",
	},
	10: {
		name: "Systolic Blood Pressure (mmHg)",
		key: "systolic_bp",
		unit: "mmHg",
	},
	// 11: {
	//   name: "Heart Pulse (bpm) - only for BPM and scale devices",
	//   key: "heart_pulse",
	//   unit: "bpm"
	// },
	// 12: {
	//   name: "Temperature (celsius)",
	//   key: "temperature",
	//   unit: "°C"
	// },
	// 54: {
	//   name: "SP02 (%)",
	//   key: "spo2",
	//   unit: "%"
	// },
	// 71: {
	//   name: "Body Temperature (celsius)",
	//   key: "body_temperature",
	//   unit: "°C"
	// },
	// 73: {
	//   name: "Skin Temperature (celsius)",
	//   key: "skin_temperature",
	//   unit: "°C"
	// },
	76: {
		name: "Muscle Mass (kg)",
		key: "muscle_mass",
		unit: "kg",
	},
	// 77: {
	//   name: "Hydration (kg)",
	//   key: "hydration",
	//   unit: "kg"
	// },
	88: {
		name: "Bone Mass (kg)",
		key: "bone_mass",
		unit: "kg",
	},
	91: {
		name: "Pulse Wave Velocity (m/s)",
		key: "pulse_wave_velocity",
		unit: "m/s",
	},
	// 123: {
	//   name: "VO2 max is a numerical measurement of your body's ability to consume oxygen (ml/min/kg)",
	//   key: "vo2_max",
	//   unit: "ml/min/kg"
	// },
	// 130: {
	//   name: "Atrial fibrillation result",
	//   key: "atrial_fibrillation_result",
	//   unit: null
	// },
	// 135: {
	//   name: "QRS interval duration based on ECG signal",
	//   key: "qrs_interval_duration",
	//   unit: "ms"
	// },
	// 136: {
	//   name: "PR interval duration based on ECG signal",
	//   key: "pr_interval_duration",
	//   unit: "ms"
	// },
	// 137: {
	//   name: "QT interval duration based on ECG signal",
	//   key: "qt_interval_duration",
	//   unit: "ms"
	// },
	// 138: {
	//   name: "Corrected QT interval duration based on ECG signal",
	//   key: "qt_corrected_interval_duration",
	//   unit: "ms"
	// },
	// 139: {
	//   name: "Atrial fibrillation result from PPG",
	//   key: "atrial_fibrillation_ppg_result",
	//   unit: null
	// },
	155: {
		name: "Vascular age",
		key: "vascular_age",
		unit: "years",
	},
	167: {
		name: "Nerve Health Score Conductance 2 electrodes Feet",
		key: "nerve_health_score_feet",
		unit: null,
	},
	// 168: {
	//   name: "Extracellular Water in kg",
	//   key: "extracellular_water",
	//   unit: "kg"
	// },
	// 169: {
	//   name: "Intracellular Water in kg",
	//   key: "intracellular_water",
	//   unit: "kg"
	// },
	170: {
		name: "Visceral Fat (without unity)",
		key: "visceral_fat",
		unit: null,
	},
	// 173: {
	//   name: "Fat Free Mass for segments",
	//   key: "fat_free_mass_segments",
	//   unit: "kg"
	// },
	// 174: {
	//   name: "Fat Mass for segments in mass unit",
	//   key: "fat_mass_segments",
	//   unit: "kg"
	// },
	// 175: {
	//   name: "Muscle Mass for segments",
	//   key: "muscle_mass_segments",
	//   unit: "kg"
	// },
	// 196: {
	//   name: "Electrodermal activity feet",
	//   key: "electrodermal_activity_feet",
	//   unit: null
	// },
	// 226: {
	//   name: "Basal Metabolic Rate (BMR)",
	//   key: "basal_metabolic_rate",
	//   unit: "kcal"
	// },
	// 227: {
	//   name: "Metabolic Age",
	//   key: "metabolic_age",
	//   unit: "years"
	// },
	// 229: {
	//   name: "Electrochemical Skin Conductance (ESC)",
	//   key: "electrochemical_skin_conductance",
	//   unit: null
	// }
} as const;

export const withingsKeys = [
	"weight",
	"height",
	"fat_free_mass",
	"fat_ratio_pct",
	"fat_mass_weight",
	"diastolic_bp",
	"systolic_bp",
	// "heart_pulse",
	// "temperature",
	// "spo2",
	// "body_temperature",
	// "skin_temperature",
	"muscle_mass",
	// "hydration",
	"bone_mass",
	"pulse_wave_velocity",
	// "vo2_max",
	// "atrial_fibrillation_result",
	// "qrs_interval_duration",
	// "pr_interval_duration",
	// "qt_interval_duration",
	// "qt_corrected_interval_duration",
	// "atrial_fibrillation_ppg_result",
	"vascular_age",
	"nerve_health_score_feet",
	// "extracellular_water",
	// "intracellular_water",
	"visceral_fat",
	// "fat_free_mass_segments",
	// "fat_mass_segments",
	// "muscle_mass_segments",
	// "electrodermal_activity_feet",
	// "basal_metabolic_rate",
	// "metabolic_age",
	// "electrochemical_skin_conductance",
] as const;
