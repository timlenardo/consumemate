import Foundation

// MARK: - Account
struct Account: Codable, Identifiable {
    let id: Int
    let phoneNumber: String
    let name: String?
    let preferredVoiceId: String?
}

// MARK: - Article
struct ArticleSummary: Codable, Identifiable {
    let id: Int
    let url: String
    let title: String
    let author: String?
    let siteName: String?
    let excerpt: String?
    let featuredImage: String?
    let wordCount: Int?
    let estimatedReadingTime: Int?
    let isRead: Bool?
    let readAt: String?
    let publicSlug: String?
    let publicUrl: String?
    let hasAudio: Bool?
    let createdAt: String?

    // Convenience computed properties with defaults
    var isArticleRead: Bool { isRead ?? false }
    var hasAudioAvailable: Bool { hasAudio ?? false }
}

struct Article: Codable, Identifiable {
    let id: Int
    let url: String
    let title: String
    let author: String?
    let siteName: String?
    let excerpt: String?
    let featuredImage: String?
    let wordCount: Int?
    let estimatedReadingTime: Int?
    let isRead: Bool?
    let readAt: String?
    let publicSlug: String?
    let publicUrl: String?
    let hasAudio: Bool?
    let createdAt: String?
    let contentMarkdown: String?
    let contentHtml: String?
    let audioUrl: String?
    let audioVoiceId: String?

    // Convenience computed properties with defaults
    var isArticleRead: Bool { isRead ?? false }
    var hasAudioAvailable: Bool { hasAudio ?? false }
    var markdown: String { contentMarkdown ?? "" }
}

// MARK: - Voice
struct Voice: Codable, Identifiable {
    let id: String
    let name: String
    let previewUrl: String?
    let category: String?
}

struct VoicesResponse: Codable {
    let voices: [Voice]
}

// MARK: - Word Timing
struct WordTiming: Codable {
    let word: String
    let start: Int  // milliseconds
    let end: Int    // milliseconds
}

// MARK: - Audio Generation Response
struct AudioGenerationResponse: Codable {
    let audioData: String  // base64 encoded
    let contentType: String
    let wordTimings: [WordTiming]
    let processedText: String
}

// MARK: - Chunked Audio Responses
struct ChunkCountResponse: Codable {
    let totalChunks: Int
    let articleId: Int
    let generatedChunks: [Int]?  // Indices of chunks already generated for this voice
    let voiceId: String?
}

struct AudioChunkResponse: Codable {
    let audioData: String  // base64 encoded
    let contentType: String
    let wordTimings: [WordTiming]
    let chunkText: String
    let chunkIndex: Int
    let totalChunks: Int
}

// MARK: - Auth Responses
struct SendCodeResponse: Codable {
    // Empty response
}

struct VerifyCodeResponse: Codable {
    let token: String
    let account: Account
    let isNewUser: Bool
}

// MARK: - API Error
struct APIErrorResponse: Codable {
    let message: String?
}
