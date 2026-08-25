use serde::{Deserialize, Serialize};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuEncoderInfo {
    pub name: String,
    pub vendor: String, // "NVIDIA", "AMD", "Intel", "Software"
    pub nvenc_supported: bool,
    pub amf_supported: bool,
    pub qsv_supported: bool,
    pub supported_codecs: Vec<String>, // ["h264", "hevc", "av1"]
}

pub struct HardwareDetector;

impl HardwareDetector {
    /// Detects GPU encoder capabilities available on the system
    pub fn detect() -> GpuEncoderInfo {
        #[cfg(target_os = "windows")]
        {
            Self::detect_windows()
        }

        #[cfg(not(target_os = "windows"))]
        {
            GpuEncoderInfo {
                name: "Development Standard Encoder".to_string(),
                vendor: "Software".to_string(),
                nvenc_supported: true,
                amf_supported: false,
                qsv_supported: false,
                supported_codecs: vec!["h264".to_string(), "hevc".to_string(), "av1".to_string()],
            }
        }
    }

    #[cfg(target_os = "windows")]
    fn detect_windows() -> GpuEncoderInfo {
        // Query system adapter using DXGI
        let mut vendor = "Software".to_string();
        let mut name = "Generic Display Adapter".to_string();
        let mut nvenc = false;
        let mut amf = false;
        let mut qsv = false;

        // Use windows crate DXGI factory to inspect adapter
        use windows::Win32::Graphics::Dxgi::{
            CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_DESC1,
        };

        unsafe {
            if let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() {
                if let Ok(adapter) = factory.EnumAdapters1(0) {
                    let mut desc = DXGI_ADAPTER_DESC1::default();
                    if adapter.GetDesc1(&mut desc).is_ok() {
                        let desc_str = String::from_utf16_lossy(&desc.Description);
                        let clean_desc = desc_str.trim_matches(char::from(0)).to_string();
                        name = clean_desc.clone();

                        let desc_lower = clean_desc.to_lowercase();
                        if desc_lower.contains("nvidia")
                            || desc_lower.contains("geforce")
                            || desc_lower.contains("rtx")
                            || desc_lower.contains("gtx")
                        {
                            vendor = "NVIDIA".to_string();
                            nvenc = true;
                        } else if desc_lower.contains("amd") || desc_lower.contains("radeon") {
                            vendor = "AMD".to_string();
                            amf = true;
                        } else if desc_lower.contains("intel")
                            || desc_lower.contains("arc")
                            || desc_lower.contains("iris")
                            || desc_lower.contains("uhd")
                        {
                            vendor = "Intel".to_string();
                            qsv = true;
                        }
                    }
                }
            }
        }

        let mut supported_codecs = vec!["h264".to_string(), "hevc".to_string()];
        // Modern GPUs support AV1 encoding (RTX 40 series, RX 7000 series, Intel Arc)
        if name.contains("40")
            || name.contains("7900")
            || name.contains("7800")
            || name.contains("7700")
            || name.contains("7600")
            || name.contains("Arc")
        {
            supported_codecs.push("av1".to_string());
        }

        info!(
            "Detected GPU: {} (Vendor: {}, NVENC: {}, AMF: {}, QSV: {})",
            name, vendor, nvenc, amf, qsv
        );

        GpuEncoderInfo {
            name,
            vendor,
            nvenc_supported: nvenc,
            amf_supported: amf,
            qsv_supported: qsv,
            supported_codecs,
        }
    }
}
