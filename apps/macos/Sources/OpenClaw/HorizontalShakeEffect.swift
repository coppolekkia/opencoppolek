import SwiftUI

struct HorizontalShakeEffect: GeometryEffect {
    var offset: CGFloat = 8
    var shakes: CGFloat = 3
    var animatableData: CGFloat

    func effectValue(size _: CGSize) -> ProjectionTransform {
        let translation = self.offset * sin(self.animatableData * .pi * self.shakes)
        return ProjectionTransform(CGAffineTransform(translationX: translation, y: 0))
    }
}

extension View {
    func horizontalShake(trigger: Int) -> some View {
        self.modifier(HorizontalShakeEffect(animatableData: CGFloat(trigger)))
    }
}
