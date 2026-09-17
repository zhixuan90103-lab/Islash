import AVFoundation
import Capacitor
import UIKit

@objc(NativeAudioPlugin)
public class NativeAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeAudioPlugin"
    public let jsName = "NativeAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "preload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
    ]

    private let engine = AVAudioEngine()
    private let swooshPlayer = AVAudioPlayerNode()
    private let crackPlayer = AVAudioPlayerNode()
    private let swooshVarispeed = AVAudioUnitVarispeed()
    private let crackVarispeed = AVAudioUnitVarispeed()
    private var swooshBuf: AVAudioPCMBuffer?
    private var crackBuf: AVAudioPCMBuffer?
    private var swooshDur: Double = 0.3
    private var wired = false

    override public func load() {
        configureSession()
        wireEngine()
    }

    private func configureSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .ambient,
                mode: .default,
                options: [.mixWithOthers, .duckOthers]
            )
            try session.setActive(true)
        } catch {
            CAPLog.print("NativeAudio session: \(error.localizedDescription)")
        }
    }

    private func wireEngine() {
        if wired { return }
        engine.attach(swooshPlayer)
        engine.attach(swooshVarispeed)
        engine.attach(crackPlayer)
        engine.attach(crackVarispeed)
        engine.connect(swooshPlayer, to: swooshVarispeed, format: nil)
        engine.connect(swooshVarispeed, to: engine.mainMixerNode, format: nil)
        engine.connect(crackPlayer, to: crackVarispeed, format: nil)
        engine.connect(crackVarispeed, to: engine.mainMixerNode, format: nil)
        wired = true
    }

    private func urlFor(_ relative: String) -> URL? {
        let ns = relative as NSString
        let ext = ns.pathExtension
        let noExt = ns.deletingPathExtension
        let dir = (noExt as NSString).deletingLastPathComponent
        let base = (noExt as NSString).lastPathComponent
        let sub = dir.isEmpty ? "public" : "public/\(dir)"
        if let u = Bundle.main.url(forResource: base, withExtension: ext, subdirectory: sub) {
            return u
        }
        let bundled = Bundle.main.bundleURL.appendingPathComponent("public/\(relative)")
        if FileManager.default.fileExists(atPath: bundled.path) { return bundled }
        return nil
    }

    private func loadBuffer(_ relative: String) -> AVAudioPCMBuffer? {
        guard let url = urlFor(relative) else { return nil }
        do {
            let file = try AVAudioFile(forReading: url)
            let frames = AVAudioFrameCount(file.length)
            guard let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: frames) else {
                return nil
            }
            try file.read(into: buf)
            return buf
        } catch {
            CAPLog.print("NativeAudio load \(relative): \(error.localizedDescription)")
            return nil
        }
    }

    private func startEngine() {
        if engine.isRunning { return }
        do {
            try engine.start()
        } catch {
            CAPLog.print("NativeAudio engine: \(error.localizedDescription)")
        }
    }

    private func fire(
        player: AVAudioPlayerNode,
        varispeed: AVAudioUnitVarispeed,
        buffer: AVAudioPCMBuffer?,
        volume: Float,
        rate: Float
    ) {
        guard let buffer else { return }
        startEngine()
        varispeed.rate = max(0.25, min(2.5, rate))
        player.volume = max(0, min(1, volume))
        player.stop()
        player.scheduleBuffer(buffer, at: nil, options: .interrupts)
        player.play()
    }

    @objc func preload(_ call: CAPPluginCall) {
        configureSession()
        wireEngine()
        if swooshBuf == nil {
            swooshBuf = loadBuffer("sfx/slash-swoosh.mp3")
            if let buf = swooshBuf {
                let sr = buf.format.sampleRate
                if sr > 1 {
                    swooshDur = Double(buf.frameLength) / sr
                }
            }
        }
        if crackBuf == nil { crackBuf = loadBuffer("sfx/wood-crack.mp3") }
        if let fmt = swooshBuf?.format {
            engine.connect(swooshPlayer, to: swooshVarispeed, format: fmt)
            engine.connect(swooshVarispeed, to: engine.mainMixerNode, format: fmt)
        }
        if let fmt = crackBuf?.format {
            engine.connect(crackPlayer, to: crackVarispeed, format: fmt)
            engine.connect(crackVarispeed, to: engine.mainMixerNode, format: fmt)
        }
        startEngine()
        call.resolve(["swooshDur": swooshDur])
    }

    @objc func play(_ call: CAPPluginCall) {
        configureSession()
        wireEngine()
        let id = call.getString("id") ?? "crack"
        let volume = call.getFloat("volume") ?? 0.7
        let rate = call.getFloat("rate") ?? 1
        if id == "swoosh" {
            if swooshBuf == nil { swooshBuf = loadBuffer("sfx/slash-swoosh.mp3") }
            fire(player: swooshPlayer, varispeed: swooshVarispeed, buffer: swooshBuf, volume: volume, rate: rate)
        } else {
            if crackBuf == nil { crackBuf = loadBuffer("sfx/wood-crack.mp3") }
            fire(player: crackPlayer, varispeed: crackVarispeed, buffer: crackBuf, volume: volume, rate: rate)
        }
        call.resolve()
    }
}
