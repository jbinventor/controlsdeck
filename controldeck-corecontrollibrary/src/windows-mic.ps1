# windows-mic.ps1 - Outputs True/False for the default capture device mute state.
# Used only on startup (onLoad) to sync button state with the real system state.
# SET operations are handled by nircmd.exe which is much faster (no compile cost).

$code = @'
using System;
using System.Runtime.InteropServices;

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection {
  int GetCount(out int numDevices);
  int Item(int nDevice, out IMMDevice device);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, out IAudioEndpointVolume endpointVolume);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int NotImpl1();
  int NotImpl2();
  int GetChannelCount(out int channelCount);
  int SetMasterVolumeLevel(float level, Guid eventContext);
  int SetMasterVolumeLevelScalar(float level, Guid eventContext);
  int GetMasterVolumeLevel(out float level);
  int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(int channelNumber, float level, Guid eventContext);
  int SetChannelVolumeLevelScalar(int channelNumber, float level, Guid eventContext);
  int GetChannelVolumeLevel(int channelNumber, out float level);
  int GetChannelVolumeLevelScalar(int channelNumber, out float level);
  int SetMute(bool isMuted, Guid eventContext);
  int GetMute(out bool isMuted);
}

public static class MicControl {
  private static readonly Guid IID_IAudioEndpointVolume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");

  public static bool GetMute() {
    Type enumeratorType = Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"));
    IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)Activator.CreateInstance(enumeratorType);
    IMMDevice device;
    enumerator.GetDefaultAudioEndpoint(1, 0, out device);
    Guid iid = IID_IAudioEndpointVolume;
    IAudioEndpointVolume vol;
    device.Activate(ref iid, 23, IntPtr.Zero, out vol);
    bool muted;
    vol.GetMute(out muted);
    return muted;
  }
}
'@

Add-Type -TypeDefinition $code
[MicControl]::GetMute()
