import Foundation

@MainActor
class AuthViewModel: ObservableObject {
    @Published var phoneNumber: String = ""
    @Published var verificationCode: String = ""
    @Published var isCodeSent: Bool = false
    @Published var isLoading: Bool = false
    @Published var error: String?
    @Published var account: Account?

    private let api = APIClient.shared

    var isAuthenticated: Bool {
        api.isAuthenticated
    }

    func sendCode() async {
        guard !phoneNumber.isEmpty else {
            error = "Please enter your phone number"
            return
        }

        isLoading = true
        error = nil

        do {
            try await api.sendCode(phoneNumber: phoneNumber)
            isCodeSent = true
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func verifyCode() async {
        guard !verificationCode.isEmpty else {
            error = "Please enter the verification code"
            return
        }

        isLoading = true
        error = nil

        do {
            let response = try await api.verifyCode(phoneNumber: phoneNumber, code: verificationCode)
            account = response.account
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func loadAccount() async {
        guard api.isAuthenticated else { return }

        do {
            account = try await api.getAccount()
        } catch {
            // Token might be invalid
            api.clearToken()
        }
    }

    func signOut() {
        api.clearToken()
        account = nil
        phoneNumber = ""
        verificationCode = ""
        isCodeSent = false
    }

    func resetToPhoneEntry() {
        isCodeSent = false
        verificationCode = ""
        error = nil
    }
}
