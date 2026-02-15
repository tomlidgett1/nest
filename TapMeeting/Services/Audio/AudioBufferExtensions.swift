import AVFoundation

/// Extensions for converting between AVAudioPCMBuffer and raw Data.
extension AVAudioPCMBuffer {
    
    /// Convert the PCM buffer contents to a raw `Data` object.
    func toData() -> Data {
        let audioBuffer = audioBufferList.pointee.mBuffers
        return Data(
            bytes: audioBuffer.mData!,
            count: Int(audioBuffer.mDataByteSize)
        )
    }
}
