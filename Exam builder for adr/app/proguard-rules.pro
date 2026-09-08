# ===== Project =====
# Domain model (mirror schema JSON web) + DTO dong bo Gist: giu nguyen ten field.
-keep class com.exambuilder.android.model.** { *; }
-keep class com.exambuilder.android.data.dto.** { *; }

# ===== kotlinx.serialization =====
# Bo quy tac chuan (README kotlinx.serialization) - neu thieu, R8 se strip cac
# lop $$serializer/Companion.serializer() -> LibraryFile.serializer() nem loi luc chay.
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault,InnerClasses,*Annotation*
-dontnote kotlinx.serialization.**

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1> {
    static <1>$Companion Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-if @kotlinx.serialization.Serializable class ** {
    public static ** INSTANCE;
}
-keepclassmembers class <1> {
    public static <1> INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class com.exambuilder.android.**$$serializer { *; }
-keepclassmembers class com.exambuilder.android.** {
    *** Companion;
}
-keepclasseswithmembers class com.exambuilder.android.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# ===== androidx.datastore (Preferences) =====
-keep class androidx.datastore.*.** { *; }

# ===== JLaTeXMath (ru.noties:jlatexmath-android) =====
# Engine scilab.forge nap font/symbol qua reflection tu ten lop trong cac file
# XML asset (TeXFormulaSettings.xml ...). Giu nguyen de R8 khong strip.
-keep class org.scilab.forge.jlatexmath.** { *; }
-keep class ru.noties.jlatexmath.** { *; }
-dontwarn org.scilab.forge.jlatexmath.**
-dontwarn ru.noties.jlatexmath.**
-dontwarn java.awt.**
-dontwarn javax.**
