import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                // Logo/Title
                VStack(spacing: 8) {
                    Image(systemName: "headphones.circle.fill")
                        .font(.system(size: 80))
                        .foregroundColor(.green)

                    Text("Consumemate")
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    Text("Listen to your articles")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                Spacer()

                // Form
                VStack(spacing: 20) {
                    if !authViewModel.isCodeSent {
                        phoneEntryView
                    } else {
                        codeEntryView
                    }

                    if let error = authViewModel.error {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 32)

                Spacer()
            }
            .navigationBarHidden(true)
        }
    }

    private var phoneEntryView: some View {
        VStack(spacing: 16) {
            TextField("Phone number", text: $authViewModel.phoneNumber)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(12)

            Button(action: {
                Task {
                    await authViewModel.sendCode()
                }
            }) {
                HStack {
                    if authViewModel.isLoading {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("Send Code")
                    }
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.green)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            .disabled(authViewModel.isLoading || authViewModel.phoneNumber.isEmpty)
        }
    }

    private var codeEntryView: some View {
        VStack(spacing: 16) {
            Text("Enter the code sent to")
                .foregroundColor(.secondary)
            Text(authViewModel.phoneNumber)
                .fontWeight(.semibold)

            TextField("Verification code", text: $authViewModel.verificationCode)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .multilineTextAlignment(.center)
                .font(.title2)
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(12)

            Button(action: {
                Task {
                    await authViewModel.verifyCode()
                }
            }) {
                HStack {
                    if authViewModel.isLoading {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("Verify")
                    }
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.green)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            .disabled(authViewModel.isLoading || authViewModel.verificationCode.isEmpty)

            Button("Use different number") {
                authViewModel.resetToPhoneEntry()
            }
            .font(.caption)
            .foregroundColor(.secondary)
        }
    }
}

#Preview {
    LoginView()
        .environmentObject(AuthViewModel())
}
